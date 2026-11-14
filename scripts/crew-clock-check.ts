/**
 * Checks for crew clock-in links (competitor gap #13): token / link rules, pairing punches into shifts (breaks,
 * overnight, missing clock-in / clock-out, double taps), weekly totals and overtime, time sheet generation, the
 * "far from the job" flag, the offline queue (order, retries, idempotency, photos), the worker state, and a lint of
 * the migration (additive only, RLS, privileges, numbers in sync with the TypeScript constants).
 *   npx tsx scripts/crew-clock-check.ts
 *   TZ=Pacific/Auckland npx tsx scripts/crew-clock-check.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    CLIENT_ID_RE, CREW_LIMITS, CREW_OVERTIME_MULTIPLIER, CREW_TOKEN_RE, DEFAULT_SITE_RADIUS_M, DUPLICATE_TAP_MS, LOCATION_STATUSES, PUNCH_KINDS,
    allowedKinds, buildSessions, classifyCrewError, clockLabel, crewInviteText, crewLinkUrl, crewTokenFromPath, distanceLabel, distanceMeters,
    durationLabel, hoursLabel, isCrewBackendMissing, isMissedClockOut, laborCostAt, mapPortal, mapPunchRow, missedClockOutAt, msToHours,
    newClientId, parseLatLng, punchLocationFlag, sessionCounts, splitPortalJobs, summarizeWeek, weekDays, weekRangeLabel, weekStartOf,
    workedInWeek, workedOnDay, workerState, type Punch, type PunchKind, type PortalJob,
} from '../lib/crew/crewLogic.ts';
import { crewTimeSheetData, isCrewTimeSheet, planTimeSheets, updatedCrewTimeSheetData } from '../lib/crew/crewTimesheet.ts';
import {
    CrewSendError, createMemoryCrewStore, dismissRejected, enqueuePunch, mergePunches, parseQueue, pendingCount, queueKey, syncPunchQueue,
    type PunchSender, type QueuedPunch,
} from '../lib/crew/punchQueue.ts';
import { OVERTIME_MULTIPLIER, laborOf, summarizeJobMoney } from '../lib/finance.ts';
import { FormType } from '../types.ts';

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

// Local-time instants (the rules are local-time rules): Monday 9 Nov 2026 … Sunday 15 Nov 2026.
const T = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const iso = (t: number) => new Date(t).toISOString();
const H = 3_600_000;
let seq = 0;
const P = (kind: PunchKind, t: number, extra: Partial<Punch> = {}): Punch => ({
    id: `p${String(++seq).padStart(3, '0')}`, clientId: `c${seq}abcdefgh`, memberId: 'maria', jobId: 'kitchen', kind, at: iso(t), source: 'crew', ...extra,
});

// =====================================================================================================================
// 1. Token / link rules
// =====================================================================================================================
{
    const token = 'AbCdEfGhIjKlMnOpQrStUvWx' + 'yz0123456789-_AB'; // 24 + 16
    eq('token is 40 chars', token.length, 40);
    ok('token regex accepts a signed token', CREW_TOKEN_RE.test(token));
    ok('token regex refuses a short one', !CREW_TOKEN_RE.test(token.slice(1)));
    ok('token regex refuses other characters', !CREW_TOKEN_RE.test(token.slice(0, 39) + '+'));
    eq('path → token', crewTokenFromPath(`/clock/${token}`), token);
    eq('path with trailing slash', crewTokenFromPath(`/clock/${token}/`), token);
    eq('token keeps its case', crewTokenFromPath(`/Clock/${token}`), token);
    eq('not a crew path', crewTokenFromPath('/dashboard'), null);
    eq('owner page is not a link', crewTokenFromPath('/crew'), null);
    eq('malformed link', crewTokenFromPath('/clock/abc'), '');
    eq('extra segment', crewTokenFromPath(`/clock/${token}/x`), '');
    eq('empty link', crewTokenFromPath('/clock/'), '');
    eq('link url', crewLinkUrl('https://www.contractordocs.app/', token), `https://www.contractordocs.app/clock/${token}`);
    const invite = crewInviteText('Maria Lopez', 'Atlas Builders', 'https://x/clock/t');
    ok('invite greets by first name', invite.startsWith('Hi Maria,'));
    ok('invite says location only at the tap', /only at the moment you tap/.test(invite));
    ok('invite has no prices', !/\$/.test(invite));
    for (let i = 0; i < 20; i++) ok(`device key ${i} matches the server rule`, CLIENT_ID_RE.test(newClientId()));
    ok('device keys differ', newClientId() !== newClientId());
}

// =====================================================================================================================
// 2. Pairing punches into shifts
// =====================================================================================================================
{
    const now = T(16, 9);
    // simple day with a 30-minute break
    const day = [P('in', T(9, 7, 2)), P('break_start', T(9, 12)), P('break_end', T(9, 12, 30)), P('out', T(9, 15, 32))];
    const [s] = buildSessions(day, { now });
    eq('one shift', buildSessions(day, { now }).length, 1);
    eq('break excluded', s.breakMs, 30 * 60_000);
    eq('worked 8h', s.workedMs, 8 * H);
    eq('day of the shift', s.day, '2026-11-09');
    ok('closed shift counts', sessionCounts(s));
    eq('no flags', s.flags, []);

    // order of input doesn't matter
    eq('unsorted punches pair the same', buildSessions([...day].reverse(), { now })[0].workedMs, 8 * H);

    // overnight shift counts on the day it started
    const night = buildSessions([P('in', T(10, 22)), P('out', T(11, 6))], { now })[0];
    eq('overnight 8h', night.workedMs, 8 * H);
    eq('overnight counts on start day', night.day, '2026-11-10');

    // open break closed by the clock-out
    const forgotBreakEnd = buildSessions([P('in', T(9, 8)), P('break_start', T(9, 12)), P('out', T(9, 13))], { now })[0];
    eq('open break ends at clock-out', forgotBreakEnd.workedMs, 4 * H);

    // missing clock-out: a new clock-in the next day
    const missed = buildSessions([P('in', T(9, 7)), P('in', T(10, 7)), P('out', T(10, 15))], { now });
    eq('two shifts', missed.length, 2);
    ok('first missing clock-out', missed[0].flags.includes('missing_out'));
    eq('missing clock-out counts 0', missed[0].workedMs, 0);
    ok('missing clock-out does not count', !sessionCounts(missed[0]));
    eq('second shift 8h', missed[1].workedMs, 8 * H);

    // missing clock-in
    const orphan = buildSessions([P('out', T(9, 15))], { now });
    ok('orphan out flagged', orphan[0].flags.includes('missing_in'));
    eq('orphan out counts 0', orphan[0].workedMs, 0);

    // double tap on the same job
    const dbl = buildSessions([P('in', T(9, 7)), P('in', T(9, 7, 1)), P('out', T(9, 15))], { now });
    eq('double tap is one shift', dbl.length, 1);
    ok('double tap flagged', dbl[0].flags.includes('double_tap'));
    eq('double tap: 8h from the first tap', dbl[0].workedMs, 8 * H);
    // a second clock-in on ANOTHER job is a job switch without a clock-out
    const sw = buildSessions([P('in', T(9, 7)), P('in', T(9, 7, 1), { jobId: 'bath' }), P('out', T(9, 15))], { now });
    eq('another job = new shift', sw.length, 2);
    ok('DUPLICATE_TAP_MS is two minutes', DUPLICATE_TAP_MS === 120_000);

    // job switch: out + in at the same instant
    const switched = buildSessions([P('in', T(9, 7)), P('out', T(9, 11)), P('in', T(9, 11), { jobId: 'bath' }), P('out', T(9, 15), { jobId: 'bath' })], { now });
    eq('switch: two shifts', switched.map(x => [x.jobId, x.workedMs / H]), [['kitchen', 4], ['bath', 4]]);

    // stray breaks
    const stray = buildSessions([P('in', T(9, 7)), P('break_end', T(9, 9)), P('out', T(9, 15))], { now })[0];
    ok('break end without start flagged', stray.flags.includes('stray_break'));
    eq('stray break changes nothing', stray.workedMs, 8 * H);
    eq('break outside a shift ignored', buildSessions([P('break_start', T(9, 7))], { now }).length, 0);

    // long shift
    const long = buildSessions([P('in', T(9, 7)), P('out', T(10, 9))], { now })[0];
    ok('26h shift flagged long', long.flags.includes('long_shift'));
    eq('long shift still counted', long.workedMs, 26 * H);

    // edited by the owner
    const edited = buildSessions([P('in', T(9, 7), { editedAt: iso(T(9, 18)) }), P('out', T(9, 15), { source: 'owner' })], { now })[0];
    ok('edited flagged', edited.flags.includes('edited'));

    // open shifts and the missed clock-out rule
    const running = buildSessions([P('in', T(14, 7))], { now: T(14, 10, 15) })[0];
    ok('running shift is open', running.open && !running.flags.includes('missing_out'));
    eq('live time so far', running.liveMs, 3 * H + 15 * 60_000);
    eq('open shift counts 0', running.workedMs, 0);
    ok('open shift does not count yet', !sessionCounts(running));
    ok('12h later = missed', isMissedClockOut(T(14, 7), T(14, 19)));
    ok('8 PM after a morning start = missed', isMissedClockOut(T(14, 9), T(14, 20, 1)));
    ok('evening shift at 8 PM is fine', !isMissedClockOut(T(14, 14), T(14, 20, 30)));
    ok('next day, 3h+ = missed', isMissedClockOut(T(14, 21), T(15, 0, 30)));
    ok('night shift just after midnight is fine', !isMissedClockOut(T(14, 22), T(15, 0, 30)));
    ok('before it starts', !isMissedClockOut(T(14, 9), T(14, 8)));
    eq('missed-at for a morning shift = 7 PM (12h)', missedClockOutAt(T(14, 7)), T(14, 19));
    eq('missed-at for a 10 AM shift = 8 PM', missedClockOutAt(T(14, 10)), T(14, 20));
    eq('missed-at for an evening shift = 3h after midnight-ish', missedClockOutAt(T(14, 22)), T(15, 1));
    const late = buildSessions([P('in', T(13, 7))], { now: T(14, 7) })[0];
    ok('yesterday\'s open shift = missing clock-out', late.open && late.flags.includes('missing_out'));

    // several workers are paired separately
    const two = buildSessions([P('in', T(9, 7)), P('in', T(9, 8), { memberId: 'joe' }), P('out', T(9, 15)), P('out', T(9, 16), { memberId: 'joe' })], { now });
    eq('per worker', two.map(x => [x.memberId, x.workedMs / H]), [['maria', 8], ['joe', 8]]);
}

// =====================================================================================================================
// 3. Weekly totals + overtime
// =====================================================================================================================
{
    const now = T(16, 9);
    eq('week starts Monday', weekStartOf('2026-11-14'), '2026-11-09');
    eq('Monday is its own week start', weekStartOf('2026-11-09'), '2026-11-09');
    eq('Sunday belongs to the week before', weekStartOf('2026-11-15'), '2026-11-09');
    eq('week start from an instant', weekStartOf(T(11, 23, 59)), '2026-11-09');
    eq('7 days', weekDays('2026-11-09'), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    eq('week label', weekRangeLabel('2026-11-09'), 'Nov 9 – 15');
    eq('week label across months', weekRangeLabel('2026-11-30'), 'Nov 30 – Dec 6');
    eq('week label across years', weekRangeLabel('2026-12-28'), 'Dec 28, 2026 – Jan 3, 2027');

    // Maria: 5 × 9h on the kitchen (Mon–Fri) = 45h → 5h overtime on Friday; plus Saturday 4h on the bath → OT too
    const punches: Punch[] = [];
    for (let d = 9; d <= 13; d++) punches.push(P('in', T(d, 7)), P('out', T(d, 16)));
    punches.push(P('in', T(14, 8), { jobId: 'bath' }), P('out', T(14, 12), { jobId: 'bath' }));
    // a shift of the week before (ends Monday) must not count in this week
    punches.push(P('in', T(8, 22)), P('out', T(9, 2)));
    // Joe: 2 days, one missing clock-out
    punches.push(P('in', T(9, 7), { memberId: 'joe' }), P('out', T(9, 15), { memberId: 'joe' }), P('in', T(10, 7), { memberId: 'joe' }));
    const sessions = buildSessions(punches, { now });
    const week = summarizeWeek(sessions, { weekStart: '2026-11-09', rule: 'weekly40' });
    const maria = week.members.find(m => m.memberId === 'maria')!;
    const joe = week.members.find(m => m.memberId === 'joe')!;
    eq('maria total 49h', maria.workedMs / H, 49);
    eq('maria regular 40h', maria.regularMs / H, 40);
    eq('maria overtime 9h', maria.overtimeMs / H, 9);
    eq('maria per day', maria.days.map(x => x / H), [9, 9, 9, 9, 9, 4, 0]);
    const kitchen = maria.jobs.find(j => j.jobId === 'kitchen')!;
    const bath = maria.jobs.find(j => j.jobId === 'bath')!;
    eq('kitchen: 40 regular + 5 OT', [kitchen.regularMs / H, kitchen.overtimeMs / H], [40, 5]);
    eq('bath: all 4h overtime (after 40)', [bath.regularMs / H, bath.overtimeMs / H], [0, 4]);
    ok('the Sunday-night shift of last week is not in this week', !maria.sessions.some(x => x.day === '2026-11-08'));
    eq('joe counts only the closed shift', joe.workedMs / H, 8);
    eq('joe has one shift to look at', joe.attention, 1);
    eq('joe open shift shown', joe.open?.day, '2026-11-10');
    eq('week total', week.workedMs / H, 57);

    const daily = summarizeWeek(sessions, { weekStart: '2026-11-09', rule: 'daily8' });
    const md = daily.members.find(m => m.memberId === 'maria')!;
    eq('daily 8: 1h OT a day × 5', md.overtimeMs / H, 5);
    eq('daily 8: Saturday 4h regular', md.jobs.find(j => j.jobId === 'bath')!.regularMs / H, 4);
    const none = summarizeWeek(sessions, { weekStart: '2026-11-09', rule: 'none' });
    eq('no overtime rule', none.members.find(m => m.memberId === 'maria')!.overtimeMs, 0);

    ok('not approved yet', !maria.approved);
    const approvedSessions = buildSessions(punches.map(p => ({ ...p, approvedAt: iso(T(15, 9)) })), { now });
    ok('approved when every counted shift is', summarizeWeek(approvedSessions, { weekStart: '2026-11-09', rule: 'weekly40' }).members.find(m => m.memberId === 'maria')!.approved);

    eq('hours with 2 decimals', msToHours(7 * H + 32 * 60_000), 7.53);
    eq('hours label', hoursLabel(7.5 * H), '7.5');
    eq('hours label dash', hoursLabel(0, true), '—');
    eq('duration label', durationLabel(7 * H + 32 * 60_000), '7h 32m');
    eq('duration label minutes', durationLabel(45 * 60_000), '45m');
    eq('clock label', clockLabel(T(9, 7, 2)), '7:02 AM');
    eq('clock label pm', clockLabel(T(9, 15, 30)), '3:30 PM');
    eq('cost at rate: 40 + 9 OT at $30', laborCostAt(40 * H, 9 * H, 30), 1605);
    eq('no rate, no cost', laborCostAt(40 * H, 0, null), null);
    eq('overtime multiplier = finance', CREW_OVERTIME_MULTIPLIER, OVERTIME_MULTIPLIER);

    // ------------------------------------------------------------------- 4. time sheets
    const plans = planTimeSheets(maria, { name: 'Maria Lopez' }, { weekStart: '2026-11-09', rule: 'weekly40' });
    eq('one sheet per job', plans.map(p => p.jobId).sort(), ['bath', 'kitchen']);
    const kp = plans.find(p => p.jobId === 'kitchen')!;
    eq('kitchen sheet hours', [kp.regularHours, kp.overtimeHours, kp.totalHours], [40, 5, 45]);
    eq('dated the last day worked', kp.date, '2026-11-13');
    eq('5 shifts', kp.shifts, 5);
    eq('punch ids', kp.punchIds.length, 10);
    eq('title', kp.title, 'Maria Lopez · Nov 9 – 15');
    ok('notes list each shift', kp.notes.split('\n').length === 7 && kp.notes.includes('Mon 11/9  7:00 AM – 4:00 PM  9h'));
    ok('notes explain overtime', /Overtime: 5 h \(after 40 h a week\)/.test(kp.notes));
    ok('no existing sheet yet', kp.existingTimesheetId === null && !kp.upToDate);
    const job = { id: 'kitchen', userId: 'u', name: 'Kitchen', clientName: 'Morgan', clientAddress: '1 Oak', startDate: '2026-11-01', endDate: null, status: 'active' as const };
    const profile = { id: 'u', email: 'o@x.test', name: 'Owner', companyName: 'Atlas', address: '9 Main', phone: '555', website: 'atlas.test', logoUrl: '' } as any;
    const data = crewTimeSheetData(kp, job, profile, { rule: 'weekly40', today: '2026-11-16', nowIso: iso(now) });
    eq('time sheet fields', [data.workerName, data.date, data.hoursWorked, data.overtimeHours, data.status], ['Maria Lopez', '2026-11-13', 40, 5, 'Draft']);
    eq('company from profile', [data.companyName, data.clientName], ['Atlas', 'Morgan']);
    ok('marked as a crew sheet', isCrewTimeSheet(data));
    ok('not every sheet is a crew sheet', !isCrewTimeSheet({ hoursWorked: 8 }));
    // job costing / profit read it like any time sheet
    eq('finance labor of the sheet ($45/h)', laborOf(data as any, 45).cost, 40 * 45 + 5 * 45 * 1.5);
    const money = summarizeJobMoney([{ id: 'ts1', type: FormType.TimeSheet, jobId: 'kitchen', hoursWorked: data.hoursWorked as number, overtimeHours: data.overtimeHours as number }], { laborRate: 50 });
    eq('job financials count the hours', [money.hours, money.overtime, money.labor], [40, 5, 2375]);
    // approved week → Approved sheet; an update keeps what the owner added
    const approvedPlan = { ...kp, approved: true };
    eq('approved week → Approved', crewTimeSheetData(approvedPlan, job, profile, { rule: 'weekly40', today: '2026-11-16', nowIso: iso(now) }).status, 'Approved');
    const existing = { ...data, signatureUrl: 'data:sig', status: 'Draft', templateId: 'modern' };
    const newer = { ...kp, regularHours: 39, totalHours: 44, notes: 'From crew clock-in, Nov 9 – 15:\nchanged', approved: true };
    const upd = updatedCrewTimeSheetData(existing, newer, { rule: 'weekly40', nowIso: iso(now) });
    eq('update: new hours, signature kept, Draft → Approved', [upd.hoursWorked, upd.signatureUrl, upd.templateId, upd.status], [39, 'data:sig', 'modern', 'Approved']);
    eq('update: generated notes replaced', upd.notes, newer.notes);
    const ownNotes = updatedCrewTimeSheetData({ ...existing, notes: 'Owner wrote this' }, newer, { rule: 'weekly40', nowIso: iso(now) });
    eq('update: owner notes kept', ownNotes.notes, 'Owner wrote this');
    eq('update: Submitted stays Submitted', updatedCrewTimeSheetData({ ...existing, status: 'Submitted' }, newer, { rule: 'weekly40', nowIso: iso(now) }).status, 'Submitted');
    // after linking, the plan knows its sheet
    const linked = buildSessions(punches.map(p => (p.memberId === 'maria' && p.jobId === 'kitchen' ? { ...p, timesheetId: 'ts1' } : p)), { now });
    const lp = planTimeSheets(summarizeWeek(linked, { weekStart: '2026-11-09', rule: 'weekly40' }).members.find(m => m.memberId === 'maria')!, { name: 'Maria' }, { weekStart: '2026-11-09', rule: 'weekly40' });
    const lk = lp.find(p => p.jobId === 'kitchen')!;
    ok('linked sheet found and up to date', lk.existingTimesheetId === 'ts1' && lk.upToDate);
    // open / missing shifts are left out of sheets
    const jp = planTimeSheets(joe, { name: 'Joe' }, { weekStart: '2026-11-09', rule: 'weekly40' });
    eq('joe: one sheet, 8h, one shift left out', [jp.length, jp[0].totalHours, jp[0].skippedMissing + jp[0].skippedOpen], [1, 8, 1]);
    // overnight shift line
    const nightPlan = planTimeSheets(summarizeWeek(buildSessions([P('in', T(10, 22), { memberId: 'n' }), P('out', T(11, 6), { memberId: 'n' })], { now }), { weekStart: '2026-11-09', rule: 'weekly40' }).members[0], { name: 'Nina' }, { weekStart: '2026-11-09', rule: 'weekly40' })[0];
    ok('overnight line names the next day', nightPlan.notes.includes('Tue 11/10  10:00 PM – Wed 6:00 AM  8h'));
}

// =====================================================================================================================
// 5. Far from the job
// =====================================================================================================================
{
    const site = { lat: 40.7128, lng: -74.006, radiusM: DEFAULT_SITE_RADIUS_M };
    const near = { lat: 40.7138, lng: -74.006 }; // ~111 m north
    const far = { lat: 40.7300, lng: -74.006 }; // ~1.9 km
    eq('distance ~111 m', Math.round(distanceMeters(site, near) / 10) * 10, 110);
    eq('distance symmetric', distanceMeters(site, far), distanceMeters(far, site));
    eq('near = ok', punchLocationFlag({ ...near, accuracyM: 20, locationStatus: 'ok' }, site).flag, 'ok');
    eq('far = far', punchLocationFlag({ ...far, accuracyM: 20, locationStatus: 'ok' }, site).flag, 'far');
    eq('poor accuracy gives slack', punchLocationFlag({ lat: 40.7165, lng: -74.006, accuracyM: 200, locationStatus: 'ok' }, site).flag, 'ok');
    eq('slack capped at 1 km', punchLocationFlag({ ...far, accuracyM: 50000, locationStatus: 'ok' }, site).flag, 'far');
    eq('no reading = no location', punchLocationFlag({ lat: null, lng: null, locationStatus: 'denied' }, site).flag, 'no_location');
    eq('no pin = no check', punchLocationFlag({ ...far, locationStatus: 'ok' }, null).flag, 'no_site');
    eq('owner punch', punchLocationFlag({ lat: null, lng: null, locationStatus: 'owner', source: 'owner' }, site).flag, 'owner');
    eq('0,0 is no reading', punchLocationFlag({ lat: 0, lng: 0, locationStatus: 'ok' }, site).flag, 'no_location');
    eq('far distance returned', punchLocationFlag({ ...far, locationStatus: 'ok' }, site).distanceM, distanceMeters(site, far));
    eq('feet', distanceLabel(100), '330 ft');
    eq('miles', distanceLabel(1900), '1.2 mi');
    eq('many miles', distanceLabel(40000), '25 mi');
    // pasting a pin
    eq('plain coordinates', parseLatLng('40.7128, -74.0060'), { lat: 40.7128, lng: -74.006 });
    eq('google @ link', parseLatLng('https://www.google.com/maps/place/X/@40.7128,-74.0060,17z/data=!3m1'), { lat: 40.7128, lng: -74.006 });
    eq('google !3d!4d wins', parseLatLng('https://www.google.com/maps/place/X/@40.1,-74.1,17z/data=!3m1!4b1!4m5!3m4!1s0x0:0x0!8m2!3d40.7128!4d-74.006'), { lat: 40.7128, lng: -74.006 });
    eq('q= link', parseLatLng('https://maps.google.com/?q=40.7128,-74.006'), { lat: 40.7128, lng: -74.006 });
    eq('apple ll=', parseLatLng('https://maps.apple.com/?ll=40.7128,-74.006&q=Site'), { lat: 40.7128, lng: -74.006 });
    eq('encoded comma', parseLatLng('https://maps.google.com/?q=40.7128%2C-74.006'), { lat: 40.7128, lng: -74.006 });
    eq('space separated', parseLatLng('40.7128 -74.006'), { lat: 40.7128, lng: -74.006 });
    eq('address only = null (no geocoding)', parseLatLng('123 Main St, Springfield'), null);
    eq('out of range = null', parseLatLng('140, 20'), null);
    eq('0,0 = null', parseLatLng('0, 0'), null);
}

// =====================================================================================================================
// 6. Worker page state
// =====================================================================================================================
{
    const now = T(14, 10);
    eq('nothing = off', workerState([], now).status, 'off');
    const working = workerState([P('in', T(14, 7))], now);
    eq('working', [working.status, working.jobId, working.since], ['working', 'kitchen', T(14, 7)]);
    eq('working can clock out or break', allowedKinds(working.status), ['out', 'break_start']);
    const onBreak = workerState([P('in', T(14, 7)), P('break_start', T(14, 9, 30))], now);
    eq('on break', [onBreak.status, onBreak.breakSince], ['break', T(14, 9, 30)]);
    eq('break can end or clock out', allowedKinds('break'), ['break_end', 'out']);
    eq('off can clock in', allowedKinds('off'), ['in']);
    eq('after clock-out = off', workerState([P('in', T(14, 7)), P('out', T(14, 9))], now).status, 'off');
    ok('forgotten shift from yesterday is late', workerState([P('in', T(13, 7))], now).late);
    const sessions = buildSessions([P('in', T(13, 7)), P('out', T(13, 15)), P('in', T(14, 7))], { now });
    eq('today so far (live)', workedOnDay(sessions, '2026-11-14') / H, 3);
    eq('this week incl. live', workedInWeek(sessions, '2026-11-14') / H, 11);
    eq('a missed clock-out adds nothing to the worker totals', workedInWeek(buildSessions([P('in', T(13, 7))], { now: T(14, 10) }), '2026-11-14'), 0);

    const job = (id: string, extra: Partial<PortalJob> = {}): PortalJob => ({ id, name: id, address: '', status: 'active', from: null, to: null, assigned: true, site: null, ...extra });
    const split = splitPortalJobs([
        job('b'), job('a'), job('future', { from: '2026-11-20' }), job('ended', { to: '2026-11-01' }), job('done', { status: 'completed' }),
        job('unassigned', { assigned: false }), job('open-elsewhere', { assigned: false }),
    ], '2026-11-14', 'open-elsewhere');
    eq('today: open shift first, then by name', split.today.map(j => j.id), ['open-elsewhere', 'a', 'b']);
    eq('coming up', split.later.map(j => j.id), ['future']);

    const portal = mapPortal({
        member: { name: 'Maria' }, company: { name: 'Atlas', logo_url: 'https://x/logo.png', phone: '555' }, paused: false,
        jobs: [{ id: 'j1', name: 'Kitchen', address: '1 Oak', status: 'active', assigned: true, site: { lat: 40.7, lng: -74, radius_m: 500 } }, { id: 'j2', name: 'Bath', site: null }],
        punches: [{ id: 'p1', client_id: 'abcdefgh1', job_id: 'j1', kind: 'in', at: iso(T(14, 7)), location: 'ok' }, { id: 'bad', kind: 'nope' }],
    }, 'me');
    eq('portal jobs + site', [portal.jobs.length, portal.jobs[0].site?.radiusM, portal.jobs[1].site], [2, 500, null]);
    eq('portal punches (broken ones dropped)', portal.punches.map(p => [p.id, p.memberId, p.locationStatus]), [['p1', 'me', 'ok']]);
    eq('portal from a string', mapPortal(JSON.stringify({ paused: true })).paused, true);
    const row = mapPunchRow({ id: 'x', member_id: 'm', job_id: 'j', kind: 'out', at: iso(T(9, 9)), lat: '40.1', lng: '-74', accuracy_m: 12, location_status: 'ok', source: 'owner', approved_at: iso(T(9, 10)) });
    eq('punch row', [row.lat, row.lng, row.accuracyM, row.source, Boolean(row.approvedAt)], [40.1, -74, 12, 'owner', true]);
}

// =====================================================================================================================
// 7. Offline queue + idempotency
// =====================================================================================================================
const runQueueTests = async () => {
    const token = 'A'.repeat(40);
    const key = queueKey(token);
    const store = createMemoryCrewStore();
    const q = (kind: PunchKind, t: number, extra: Partial<QueuedPunch> = {}): QueuedPunch => ({
        clientId: newClientId(), jobId: 'kitchen', kind, at: iso(t), lat: 40.71, lng: -74.0, accuracy: 15, location: 'ok', note: '', photoType: null,
        status: 'pending', attempts: 0, error: null, savedId: null, uploadPath: null, queuedAt: iso(t), ...extra,
    });

    // a fake server: idempotent on clientId, like crew_punch
    const server = new Map<string, { id: string; kind: PunchKind; at: string }>();
    const uploads: string[] = [];
    let offline = false;
    let failAfterSave = false;
    let refuse: string | null = null;
    let link: 'ok' | 'invalid' | 'paused' = 'ok';
    const sender: PunchSender = {
        async send(p) {
            if (offline) throw new CrewSendError('network', 'offline');
            if (link === 'invalid') throw new CrewSendError('invalid_link', 'dead link');
            if (link === 'paused') throw new CrewSendError('paused', 'paused');
            if (refuse && p.clientId === refuse) throw new CrewSendError('rejected', 'You are not on this job anymore.');
            const existing = server.get(p.clientId);
            const row = existing || { id: `srv-${server.size + 1}`, kind: p.kind, at: p.at };
            server.set(p.clientId, row);
            if (failAfterSave) { failAfterSave = false; throw new CrewSendError('network', 'timed out after the save'); }
            return { id: row.id, uploadPath: p.photoType ? `u/m/${row.id}.${p.photoType}` : null, duplicate: Boolean(existing) };
        },
        async upload(path) {
            if (offline) throw new CrewSendError('network', 'offline');
            uploads.push(path);
        },
    };

    // offline: three punches queue in order
    const a = q('in', T(14, 7));
    const b = q('break_start', T(14, 12));
    const c = q('break_end', T(14, 12, 30), { photoType: 'jpg', note: 'Lunch' });
    let items: QueuedPunch[] = [];
    for (const p of [a, b, c]) items = enqueuePunch(items, p);
    items = enqueuePunch(items, a); // same device key again
    eq('same punch queued once', items.length, 3);
    await store.writeQueue(key, items);
    await store.putPhoto(c.clientId, new Blob(['x'], { type: 'image/jpeg' }));
    offline = true;
    let report = await syncPunchQueue(store, key, sender);
    eq('offline: nothing sent, stopped by network', [report.sent, report.remaining, report.stoppedBy], [0, 3, 'network']);
    eq('offline: attempt counted', (await store.readQueue(key))[0].attempts, 1);
    eq('the worker still sees the punches', mergePunches([], await store.readQueue(key), 'me').map(p => p.kind), ['in', 'break_start', 'break_end']);
    ok('queued punches are marked pending', mergePunches([], await store.readQueue(key), 'me').every(p => p.pending && p.id.startsWith('local:')));
    eq('worker state from the queue', workerState(mergePunches([], await store.readQueue(key), 'me'), T(14, 13)).status, 'working');

    // back online: a timeout after the server saved the first punch → retried, still one row
    offline = false;
    failAfterSave = true;
    report = await syncPunchQueue(store, key, sender);
    eq('timeout after save: stops', report.stoppedBy, 'network');
    eq('server has it once', server.size, 1);
    report = await syncPunchQueue(store, key, sender);
    eq('retry sends everything', [report.sent, report.remaining, report.stoppedBy], [3, 0, null]);
    eq('server rows (idempotent)', server.size, 3);
    eq('photo uploaded to the handed-out path', uploads, ['u/m/srv-3.jpg']);
    eq('photo removed from the phone', await store.getPhoto(c.clientId), null);
    eq('queue empty', (await store.readQueue(key)).length, 0);

    // a refused punch is kept as "Not saved" and the next one still goes
    const d = q('out', T(14, 15));
    const e = q('in', T(14, 15, 5), { jobId: 'bath' });
    refuse = d.clientId;
    await store.writeQueue(key, [d, e]);
    report = await syncPunchQueue(store, key, sender);
    eq('refused kept, next sent', [report.sent, report.rejected, report.remaining], [1, 1, 0]);
    const left = await store.readQueue(key);
    eq('refused punch keeps the reason', [left.length, left[0].status, left[0].error], [1, 'rejected', 'You are not on this job anymore.']);
    eq('refused punches are not in the worker state', mergePunches([], left, 'me').length, 0);
    eq('dismiss removes it', (await dismissRejected(store, key, d.clientId)).length, 0);
    refuse = null;

    // dead or paused link: nothing is lost
    const f = q('in', T(15, 7));
    await store.writeQueue(key, [f]);
    link = 'invalid';
    report = await syncPunchQueue(store, key, sender);
    eq('dead link keeps the punch', [report.stoppedBy, report.remaining], ['invalid_link', 1]);
    link = 'paused';
    report = await syncPunchQueue(store, key, sender);
    eq('paused link keeps the punch', [report.stoppedBy, report.remaining], ['paused', 1]);
    link = 'ok';

    // a photo whose upload drops: the punch is saved, the photo waits (no second punch)
    const g = q('out', T(15, 15), { photoType: 'png' });
    await store.writeQueue(key, [g]);
    await store.putPhoto(g.clientId, new Blob(['y'], { type: 'image/png' }));
    const realUpload = sender.upload;
    sender.upload = async () => { throw new CrewSendError('network', 'dropped'); };
    report = await syncPunchQueue(store, key, sender);
    const waiting = (await store.readQueue(key)).find(i => i.clientId === g.clientId)!;
    ok('photo waits, punch saved', report.stoppedBy === 'network' && Boolean(waiting.savedId) && waiting.uploadPath === `u/m/${waiting.savedId}.png`);
    sender.upload = realUpload;
    const before = server.size;
    report = await syncPunchQueue(store, key, sender);
    eq('photo goes up later without a new punch', [report.remaining, server.size === before, uploads[uploads.length - 1]], [0, true, `u/m/${waiting.savedId}.png`]);

    // one run at a time
    await store.writeQueue(key, [q('in', T(16, 7))]);
    const [r1, r2] = await Promise.all([syncPunchQueue(store, key, sender), syncPunchQueue(store, key, sender)]);
    ok('concurrent syncs share one run', r1 === r2 && r1.sent === 1);

    // merge: a queued punch the server already has is shown once
    const h = q('in', T(16, 7));
    eq('merge by device key', mergePunches([{ id: 's1', clientId: h.clientId, memberId: 'me', jobId: 'kitchen', kind: 'in', at: h.at }], [h], 'me').length, 1);
    // the stored queue is cleaned
    eq('broken rows dropped', parseQueue([{ clientId: 'bad' }, h, h, { ...h, clientId: newClientId(), kind: 'nope' }]).length, 1);
    eq('pending count', pendingCount([h, { ...h, clientId: newClientId(), status: 'rejected' }]), 1);
    const store2 = createMemoryCrewStore();
    store2.failNextWrite = true;
    let threw = false;
    try { await store2.writeQueue('k', [h]); } catch { threw = true; }
    ok('a full phone is reported (not silently dropped)', threw);
};

// =====================================================================================================================
// 8. Errors
// =====================================================================================================================
{
    eq('network', classifyCrewError({ name: 'TypeError', message: 'Failed to fetch' }).kind, 'network');
    eq('missing table', classifyCrewError({ code: 'PGRST205', message: "Could not find the table 'public.crew_members'" }).kind, 'unavailable');
    ok('missing function', isCrewBackendMissing({ code: 'PGRST202', message: 'Could not find the function public.crew_punch' }));
    eq('rate limit', classifyCrewError({ code: 'P0001', message: 'RATE_LIMIT: Too many tries from this device. Please wait a few minutes.' }), { kind: 'rate_limit', message: 'Too many tries from this device. Please wait a few minutes.' });
    eq('premium', classifyCrewError({ code: 'P0001', hint: 'premium', message: 'PREMIUM_REQUIRED: Crew clock-in links are part of Premium. Upgrade to add your crew.' }).kind, 'premium');
    eq('refused punch', classifyCrewError({ code: '22023', message: 'You are not on this job anymore. Ask your boss to add you to it.' }), { kind: 'rejected', message: 'You are not on this job anymore. Ask your boss to add you to it.' });
}

// =====================================================================================================================
// 9. Migration lint + constants in sync
// =====================================================================================================================
{
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const sql = readFileSync(join(root, 'supabase/migrations/20261115000100_crew_clock_in.sql'), 'utf8');
    const noComments = sql.replace(/--.*$/gm, '');
    const newTables = ['crew_members', 'crew_assignments', 'crew_job_sites', 'time_punches', 'crew_rate_events', 'crew_link_secret'];
    ok('additive: no drop table / column', !/\bdrop\s+(table|column|schema|function)\b/i.test(noComments) && !/\balter\s+table\s+public\.(?!crew_|time_punches)\w+/i.test(noComments));
    ok('no change to existing rows', !/\b(update|delete from)\s+public\.(clients|jobs|documents|profiles)\b/i.test(noComments));
    ok('tables created if not exists', newTables.every(t => new RegExp(`create table if not exists public\\.${t} \\(`).test(noComments)));
    ok('every new table has RLS', newTables.every(t => new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(noComments)));
    ok('owner policies on the four owner tables', ['crew_members', 'crew_assignments', 'crew_job_sites', 'time_punches'].every(t =>
        ['select', 'insert', 'update', 'delete'].every(op => new RegExp(`create policy ${t}_${op}_own on public\\.${t} for ${op} to authenticated`).test(noComments))));
    ok('rate log + secret have no policies', !/create policy \w+ on public\.(crew_rate_events|crew_link_secret)/.test(noComments));
    ok('anon has no table privileges', /revoke all on public\.crew_members, public\.crew_assignments, public\.crew_job_sites, public\.time_punches,\s*public\.crew_rate_events, public\.crew_link_secret from anon;/.test(noComments));
    ok('secret + rate log server only', /revoke all on public\.crew_rate_events, public\.crew_link_secret from authenticated;/.test(noComments));
    ok('every function pins an empty search_path', (noComments.match(/create or replace function/g) || []).length === (noComments.match(/set search_path = ''/g) || []).length);
    ok('functions revoked from public first', /revoke all on function %s from public, anon, authenticated/.test(noComments));
    ok('public RPCs granted to anon', /grant execute on function public\.crew_portal_get\(text\)\s+to anon, authenticated;/.test(noComments)
        && /grant execute on function public\.crew_punch\(text, uuid, text, timestamptz, double precision, double precision,\s*double precision, text, text, text, text\)\s+to anon, authenticated;/.test(noComments));
    ok('owner RPCs only for signed-in users', /grant execute on function public\.crew_links\(\)\s+to authenticated;/.test(noComments) && /grant execute on function public\.crew_member_link\(uuid, text\)\s+to authenticated;/.test(noComments));
    ok('link signature uses HMAC-SHA256 with the server key', /extensions\.hmac\(p_member_id::text \|\| ':' \|\| p_nonce, s\.secret, 'sha256'\)/.test(noComments));
    ok('token checked against its signature', /public\._crew_link_signature\(v_m\.id, v_m\.link_nonce\) is distinct from right\(v_token, 16\)/.test(noComments));
    ok('archived members can\'t use their link', /if not found or not v_m\.active then/.test(noComments));
    ok('idempotent on member + device key', /constraint time_punches_member_client_key unique \(member_id, client_id\)/.test(noComments) && /where member_id = v_m\.id and client_id = v_client/.test(noComments));
    ok('punches serialized per member', /pg_advisory_xact_lock\(hashtextextended\('crew-punch:'/.test(noComments));
    ok('rate limited (IP hashed, never stored raw)', /_crew_rate_guard\(v_hash, null, 'punch'\)/.test(noComments) && /extensions\.digest\('cd-crew-link:' \|\| v_ip, 'sha256'\)/.test(noComments));
    ok('bad links are counted (not rolled back)', /insert into public\.crew_rate_events \(ip_hash, kind\) values \(v_hash, 'bad'\);\s*return jsonb_build_object\('error', 'invalid_link'\)/.test(noComments));
    ok('Free plan pauses the link', /if public\.user_effective_tier\(v_m\.user_id\) = 'free' then\s*return jsonb_build_object\('error', 'paused'\)/.test(noComments));
    ok('Premium to add crew', /PREMIUM_REQUIRED: Crew clock-in links are part of Premium/.test(noComments));
    ok('only assigned jobs (or recently punched ones)', /exists \(select 1 from public\.crew_assignments a where a\.member_id = v_m\.id and a\.job_id = v_job\)/.test(noComments));
    ok('no location never refuses a punch', /v_status := case when v_status in \('denied', 'unavailable', 'timeout', 'skipped'\) then v_status else 'unavailable' end;/.test(noComments));
    ok('the portal never returns prices or rates', !/cost_rate/.test(noComments.split('create or replace function public.crew_portal_get')[1].split('create or replace function public.crew_punch')[0]));
    ok('direct writes can\'t forge a worker punch', /new\.source := 'owner';/.test(noComments) && /new\.location_status := 'owner';/.test(noComments));
    ok('the link nonce is set only by the server', /new\.link_nonce := public\._new_crew_nonce\(\);/.test(noComments) && /new\.link_nonce := old\.link_nonce;/.test(noComments));
    ok('photo uploads only to handed-out paths', /with check \(bucket_id = 'crew-photos' and public\.can_upload_crew_photo\(name\)\)/.test(noComments));
    ok('existing buckets untouched', !/\('(logos|forum|price-book-images|signatures|document-assets|request-photos|job-photos|portal-photos)'/.test(noComments));
    ok('indexes for the owner views', ['idx_time_punches_user_at', 'idx_time_punches_member_at', 'idx_time_punches_job_at', 'idx_crew_members_user'].every(i => noComments.includes(i)));

    // numbers shared with TypeScript
    ok('token regex in sync', noComments.includes(`'^[A-Za-z0-9_-]{40}$'`) && CREW_TOKEN_RE.source === '^[A-Za-z0-9_-]{40}$');
    ok('device key regex in sync', noComments.includes(`'${CLIENT_ID_RE.source}'`));
    ok('punch kinds in sync', noComments.includes(`kind in (${PUNCH_KINDS.map(k => `'${k}'`).join(', ')})`));
    ok('location statuses in sync', noComments.includes(`location_status in (${LOCATION_STATUSES.map(k => `'${k}'`).join(', ')})`));
    ok('note length in sync', noComments.includes(`length(note) <= ${CREW_LIMITS.note}`) && noComments.includes(`_clean_multiline(p_note, ${CREW_LIMITS.note})`));
    ok('name length in sync', noComments.includes(`between 1 and ${CREW_LIMITS.name}`));
    ok('rate cap in sync', noComments.includes(`cost_rate <= ${CREW_LIMITS.maxRate}`));
    ok('member cap in sync', noComments.includes(`>= ${CREW_LIMITS.members} then`));
    ok('jobs per member in sync', noComments.includes(`>= ${CREW_LIMITS.jobsPerMember} then`));
    ok('punch age in sync', noComments.includes(`interval '${CREW_LIMITS.punchMaxAgeDays} days'`));
    ok('site radius in sync', new RegExp(`radius_m\\s+integer not null default ${DEFAULT_SITE_RADIUS_M} check \\(radius_m between ${CREW_LIMITS.siteRadiusMin} and ${CREW_LIMITS.siteRadiusMax}\\)`).test(noComments));
    ok('photo size in sync', noComments.includes(`('crew-photos', 'crew-photos', false, ${CREW_LIMITS.photoBytes}`));

    // app wiring
    const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
    const pp = vercel.headers.flatMap((h: any) => h.headers).find((h: any) => h.key === 'Permissions-Policy')?.value || '';
    ok('Permissions-Policy lets the page ask for a location', /geolocation=\(self\)/.test(pp));
    const indexSrc = readFileSync(join(root, 'index.tsx'), 'utf8');
    ok('index.tsx routes /clock/<token> to the worker page (no app shell)', /crewTokenFromPath\(location\.pathname\)/.test(indexSrc) && /CrewClockPage/.test(indexSrc));
    const routes = readFileSync(join(root, 'lib/routes.ts'), 'utf8');
    ok('/crew is an app screen', /case '\/crew': return \{ screen: 'crew' \};/.test(routes));
}

runQueueTests().then(() => {
    console.log(`${failures ? 'FAILED' : 'OK'}: ${passes} passed, ${failures} failed (TZ=${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
    if (failures) process.exit(1);
}).catch((e) => {
    console.error(e);
    process.exit(1);
});
