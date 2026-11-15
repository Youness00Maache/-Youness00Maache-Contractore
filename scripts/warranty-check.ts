/**
 * Checks for D10 (warranty tracking + after-the-job emails), pure logic only (no network):
 *   warranty term / expiry / status / claims state machine / validation / backwards compatibility,
 *   the three reminder kinds (completion, warranty, maintenance): settings, scheduling, "never twice", messages,
 *   the dispatch loop with the new kinds, and a static scan of migration 20261116000900 and the wiring.
 * Run: npx tsx scripts/warranty-check.ts   (also with TZ=Pacific/Auckland: results must not depend on the machine)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addClaim, addMonths, claimsSummary, editClaim, emptyTracking, isFailure, moveClaim, parseDurationText, parseTracking, removeClaim,
  setTerm, sortClaims, validateClaimInput, voidWarranty, unvoidWarranty, warrantyState, warrantyStatusText, warrantyTerm, WARRANTY_LIMITS,
  type TrackingResult, type WarrantyTracking,
} from '../supabase/functions/reminders/shared/warranty.ts';
import {
  buildPostJobValues, completionDay, decidePostJob, defaultPostJobSettings, durationText, nextPostJobSteps, normalizePostJobOffsets,
  parsePostJobSettings, planPostJobSteps, POST_JOB_SETTING, POST_JOB_TEMPLATE_KEYS, POST_JOB_TEMPLATE_PLACEHOLDERS, POST_JOB_TEMPLATES,
  postJobDedupeKey, postJobStepKey, renderPostJob, setMaintenanceTip, setPostJobEnabled, setPostJobOffsets, setPostJobTemplate,
  setWarrantyOwner, warrantyAppLink, whenText, type PostJobDecisionInput, type PostJobFacts, type PostJobSettings,
} from '../supabase/functions/reminders/shared/postjob.ts';
import { DEFAULT_REMINDER_SETTINGS, type RecordedReminder } from '../supabase/functions/reminders/shared/schedule.ts';
import { DEFAULT_TEMPLATES, fillTemplate } from '../supabase/functions/reminders/shared/messages.ts';
import { dispatchReminders, type Claim, type DispatchDeps, type OutgoingReminder } from '../supabase/functions/reminders/shared/dispatch.ts';
import { readWarrantyTracking, warrantyOverview, withWarrantyTracking, hasWarrantyTracking } from '../lib/warranty/warrantyLogic.ts';
import { BOUND_ROWS, POST_JOB_ROWS } from '../lib/automations/rules.ts';
import {
  AUDIENCE_LABELS, applyCoverage, applyDurationText, claimChipText, claimMoves, claimNeedsReason, coverageMode, durationLabel, formatDay, lengthOf,
  offsetsText, openClaimsText, overviewOfDocument, parseOffsetsText, refreshOverview, timeLeftText, warrantyBuckets, warrantyScheduleText, warrantySummary,
} from '../lib/warranty/warrantyView.ts';
import { planUpcoming, type UpcomingTarget } from '../lib/warranty/postJobPlan.ts';
import { CLAIM_TRANSITIONS } from '../supabase/functions/reminders/shared/warranty.ts';

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
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');
const tracked = (r: TrackingResult): WarrantyTracking => {
  if (isFailure(r)) throw new Error(`unexpected failure: ${r.message}`);
  return (r as { tracking: WarrantyTracking }).tracking;
};

/* ================================================================ 1. term parsing and dates */
eq('duration 1 Year', parseDurationText('1 Year'), { value: 1, unit: 'years' });
eq('duration 90 Days', parseDurationText('90 Days'), { value: 90, unit: 'days' });
eq('duration 6 Months', parseDurationText('6 Months'), { value: 6, unit: 'months' });
eq('duration 2 yrs', parseDurationText('2 yrs'), { value: 2, unit: 'years' });
eq('duration 3 weeks = 21 days', parseDurationText('3 weeks'), { value: 21, unit: 'days' });
eq('duration Lifetime', parseDurationText('Lifetime'), { lifetime: true });
eq('duration mixed text = unknown', parseDurationText('1 year labor / 10 years roof'), null);
eq('duration empty', parseDurationText(''), null);
eq('duration 0 years rejected', parseDurationText('0 years'), null);
eq('duration absurd rejected', parseDurationText('900 years'), null);
eq('addMonths simple', addMonths('2026-01-15', 12), '2027-01-15');
eq('addMonths clamps Jan 31 + 1', addMonths('2026-01-31', 1), '2026-02-28');
eq('addMonths leap Feb 29 + 12', addMonths('2028-02-29', 12), '2029-02-28');
eq('addMonths across year', addMonths('2026-11-30', 3), '2027-02-28');

/* ================================================================ 2. warranty term, status, backwards compatibility */
const legacy = { completedDate: '2026-01-15', duration: '1 Year' };
eq('legacy warranty: end from completedDate + duration', warrantyTerm(legacy).expiresOn, '2027-01-15');
eq('legacy warranty: source', warrantyTerm(legacy).source, 'duration_text');
eq('legacy lifetime', warrantyState({ completedDate: '2026-01-15', duration: 'Lifetime' }, '2026-11-15').status, 'lifetime');
eq('unknown duration -> unknown', warrantyState({ completedDate: '2026-01-15', duration: 'see contract' }, '2026-11-15').status, 'unknown');
eq('no start: created_at fallback', warrantyTerm({ duration: '90 Days', createdAt: '2026-10-01T15:00:00Z' }).expiresOn, '2026-12-30');
eq('tracking term wins over text', warrantyTerm({ ...legacy, warrantyTracking: { v: 1, termValue: 2, termUnit: 'years', claims: [] } }).expiresOn, '2028-01-15');
eq('tracking start wins over completedDate', warrantyTerm({ ...legacy, warrantyTracking: { v: 1, startDate: '2026-03-01', claims: [] } }).expiresOn, '2027-03-01');
eq('explicit end wins', warrantyTerm({ ...legacy, warrantyTracking: { v: 1, expiresOn: '2026-12-31', termValue: 5, termUnit: 'years', claims: [] } }).expiresOn, '2026-12-31');
eq('status active', warrantyState(legacy, '2026-06-01').status, 'active');
eq('status expiring (60 days)', warrantyState(legacy, '2026-11-20').status, 'expiring');
eq('status expiring custom window', warrantyState(legacy, '2026-11-20', { expiringDays: 30 }).status, 'active');
eq('status ends today = expiring', [warrantyState(legacy, '2027-01-15').status, warrantyState(legacy, '2027-01-15').daysLeft], ['expiring', 0]);
eq('status expired', warrantyState(legacy, '2027-01-16').status, 'expired');
eq('status void', warrantyState({ ...legacy, warrantyTracking: { v: 1, voidedAt: '2026-05-01T00:00:00Z', claims: [] } }, '2026-06-01').status, 'void');
eq('status text', [warrantyStatusText({ status: 'active', daysLeft: 30 }), warrantyStatusText({ status: 'expiring', daysLeft: 0 }), warrantyStatusText({ status: 'expired', daysLeft: -1 })],
  ['Ends in 30 days', 'Ends today', 'Ended 1 day ago']);

/* ================================================================ 3. parsing, caps, data helpers */
eq('parse garbage = empty', parseTracking('nope'), emptyTracking());
eq('parse array = empty', parseTracking([1, 2]), emptyTracking());
const many = { v: 1, claims: Array.from({ length: 80 }, (_, i) => ({ id: `c${i}`, date: '2026-05-01', description: 'x', status: 'open' })) };
eq('claims capped', parseTracking(many).claims.length, WARRANTY_LIMITS.maxClaims);
eq('duplicate claim ids dropped', parseTracking({ claims: [{ id: 'a', date: '2026-05-01' }, { id: 'a', date: '2026-05-02' }] }).claims.length, 1);
eq('bad claim (no date) dropped', parseTracking({ claims: [{ id: 'a', date: 'yesterday' }] }).claims.length, 0);
eq('bad status -> open', parseTracking({ claims: [{ id: 'a', date: '2026-05-01', status: 'weird' }] }).claims[0].status, 'open');
eq('photo paths filtered', parseTracking({ claims: [{ id: 'a', date: '2026-05-01', photos: ['u/war/1.jpg', '../etc/passwd', 'javascript:alert(1)', 5] }] }).claims[0].photos, ['u/war/1.jpg']);
eq('bad term dropped', parseTracking({ termValue: 0, termUnit: 'years' }).termValue, undefined);
eq('term without unit dropped', parseTracking({ termValue: 3 }).termValue, undefined);
const legacyData = { warrantyNumber: 'WAR-1', completedDate: '2026-01-15', duration: '1 Year', coverage: 'All work', conditions: 'Wear' };
eq('legacy data reads as empty tracking', readWarrantyTracking(legacyData), emptyTracking());
ok('legacy data has no tracking key', !hasWarrantyTracking(legacyData));
eq('empty tracking keeps the data unchanged', withWarrantyTracking(legacyData, emptyTracking()), legacyData);
const withT = withWarrantyTracking(legacyData, { v: 1, termValue: 2, termUnit: 'years', claims: [] });
eq('tracking stored, other fields kept', [withT.warrantyNumber, withT.coverage, (withT.warrantyTracking as WarrantyTracking).termValue], ['WAR-1', 'All work', 2]);
const ov = warrantyOverview(legacyData, '2026-11-20');
eq('overview of a legacy warranty', [ov.status, ov.expiresOn, ov.coverage, ov.exclusions, ov.claims.total], ['expiring', '2027-01-15', 'All work', 'Wear', 0]);

/* ================================================================ 4. claims: add, edit, state machine, validation */
const NOW = Date.UTC(2026, 10, 15, 12);
const TODAY = '2026-11-15';
let t = emptyTracking();
t = tracked(addClaim(t, { id: 'c1', date: '2026-11-10', description: 'Grout cracking in shower' }, NOW, TODAY));
t = tracked(addClaim(t, { id: 'c2', date: '2026-11-12', description: 'Door sticks', photos: ['u1/war/door.jpg'] }, NOW, TODAY));
eq('two claims', t.claims.map((c) => [c.id, c.status]), [['c1', 'open'], ['c2', 'open']]);
ok('duplicate id refused', isFailure(addClaim(t, { id: 'c1', date: '2026-11-10', description: 'again' }, NOW, TODAY)));
ok('empty description refused', isFailure(addClaim(t, { id: 'c3', date: '2026-11-10', description: '  ' }, NOW, TODAY)));
ok('future date refused', isFailure(addClaim(t, { id: 'c3', date: '2026-12-10', description: 'x' }, NOW, TODAY)));
ok('bad id refused', isFailure(addClaim(t, { id: 'bad id!', date: '2026-11-10', description: 'x' }, NOW, TODAY)));
ok('too many photos refused', isFailure(validateClaimInput({ date: TODAY, description: 'x', photos: Array.from({ length: 7 }, (_, i) => `p${i}.jpg`) }, TODAY)));
t = tracked(moveClaim(t, 'c1', 'in_review', { now: NOW, today: TODAY }));
eq('open -> in_review', t.claims[0].status, 'in_review');
t = tracked(moveClaim(t, 'c1', 'resolved', { resolution: 'Regrouted', now: NOW, today: TODAY }));
eq('in_review -> resolved sets resolvedOn', [t.claims[0].status, t.claims[0].resolvedOn, t.claims[0].resolution], ['resolved', TODAY, 'Regrouted']);
ok('resolved -> in_review not allowed', isFailure(moveClaim(t, 'c1', 'in_review', { now: NOW, today: TODAY })));
ok('denied needs a reason', isFailure(moveClaim(t, 'c2', 'denied', { now: NOW, today: TODAY })));
ok('resolvedOn before the claim refused', isFailure(moveClaim(t, 'c2', 'resolved', { resolvedOn: '2026-11-01', now: NOW, today: TODAY })));
t = tracked(moveClaim(t, 'c2', 'denied', { resolution: 'Damage from a moving truck', now: NOW, today: TODAY }));
t = tracked(moveClaim(t, 'c1', 'open', { now: NOW, today: TODAY }));
eq('reopen clears resolvedOn, keeps the text', [t.claims[0].status, t.claims[0].resolvedOn, t.claims[0].resolution], ['open', null, 'Regrouted']);
eq('same status = no change', tracked(moveClaim(t, 'c1', 'open', { now: NOW, today: TODAY })), t);
ok('unknown claim refused', isFailure(moveClaim(t, 'zz', 'open', { now: NOW, today: TODAY })));
t = tracked(editClaim(t, 'c1', { description: 'Grout cracking, two tiles loose' }, NOW + 1, TODAY));
eq('edit keeps status', [t.claims[0].description, t.claims[0].status, t.claims[0].updatedAt], ['Grout cracking, two tiles loose', 'open', NOW + 1]);
const sum = claimsSummary(t.claims);
eq('summary', [sum.total, sum.open, sum.denied, sum.active, sum.oldestActive], [2, 1, 1, 1, '2026-11-10']);
eq('sort: active first', sortClaims(t.claims).map((c) => c.id), ['c1', 'c2']);
eq('remove claim', removeClaim(t, 'c2').claims.map((c) => c.id), ['c1']);
eq('void / unvoid', [!!voidWarranty(t, new Date(NOW)).voidedAt, unvoidWarranty(voidWarranty(t, new Date(NOW))).voidedAt], [true, undefined]);
ok('setTerm: end before start refused', isFailure(setTerm(t, { startDate: '2026-05-01', expiresOn: '2026-04-01' })));
ok('setTerm: length without unit refused', isFailure(setTerm(t, { termValue: 3 })));
ok('setTerm: lifetime + end refused', isFailure(setTerm(t, { lifetime: true, expiresOn: '2027-01-01' })));
eq('setTerm: 18 months', tracked(setTerm(t, { termValue: 18, termUnit: 'months' })).termUnit, 'months');
eq('setTerm: null clears', tracked(setTerm({ ...t, termValue: 2, termUnit: 'years' }, { termValue: null, termUnit: null })).termValue, undefined);
eq('setTerm keeps claims', tracked(setTerm(t, { lifetime: true })).claims.length, 2);

/* ================================================================ 5. after-the-job settings */
const d = defaultPostJobSettings();
eq('all kinds off by default', [d.completion.enabled, d.warranty.enabled, d.maintenance.enabled], [false, false, false]);
eq('default offsets', [d.completion.offsets, d.warranty.offsets, d.warranty.ownerOffsets, d.maintenance.offsets], [[3], [60, 30, 7, 0], [30, 0], [180, 365]]);
eq('parse garbage = defaults', parsePostJobSettings('{bad'), d);
eq('parse null = defaults', parsePostJobSettings(null), d);
eq('warranty offsets sorted far first, capped', normalizePostJobOffsets('warranty', [0, 7, 200, 30, 60, 90, -1]), [90, 60, 30, 7]);
eq('maintenance offsets range', normalizePostJobOffsets('maintenance', [3, 180, 2000, 365]), [180, 365]);
const on = setPostJobEnabled(d, 'completion', true, TODAY, NOW);
eq('turning on records since', [on.completion.enabled, on.completion.since, on.at], [true, TODAY, NOW]);
eq('turning on again keeps since', setPostJobEnabled(on, 'completion', true, '2026-12-01', NOW + 5).completion.since, TODAY);
const offAgain = setPostJobEnabled(on, 'completion', false, '2026-12-01', NOW + 5);
eq('off then on = new since', setPostJobEnabled(offAgain, 'completion', true, '2026-12-01', NOW + 6).completion.since, '2026-12-01');
eq('round trip through storage', parsePostJobSettings(JSON.parse(JSON.stringify(on))), on);
eq('setPostJobOffsets refuses an empty list', setPostJobOffsets(on, 'completion', [500], NOW), on);
eq('setWarrantyOwner', setWarrantyOwner(d, { notifyOwner: false, ownerOffsets: [14] }, NOW).warranty.ownerOffsets, [14]);
eq('tip capped', setMaintenanceTip(d, 'x'.repeat(900), NOW).maintenance.tip.length, 600);
eq('template saved + cleared', [Object.keys(setPostJobTemplate(d, 'completion', { subject: 'Hi', body: 'Body' }, NOW).templates), Object.keys(setPostJobTemplate(d, 'completion', null, NOW).templates)], [['completion'], []]);
eq('enabled without since parses (and is treated as off)', parsePostJobSettings({ completion: { enabled: true } }).completion.since, null);

/* ================================================================ 6. completion day */
const NY = 'America/New_York';
eq('not completed -> null', completionDay({ status: 'active', end_date: '2026-11-01', updated_at: '2026-11-02T12:00:00Z' }, NY), null);
eq('end date before last save', completionDay({ status: 'completed', end_date: '2026-11-01', updated_at: '2026-11-05T12:00:00Z' }, NY), '2026-11-01');
eq('marked early: last save day', completionDay({ status: 'completed', end_date: '2026-12-01', updated_at: '2026-11-05T12:00:00Z' }, NY), '2026-11-05');
eq('no end date: last save (local day)', completionDay({ status: 'completed', end_date: null, updated_at: '2026-11-05T03:00:00Z' }, NY), '2026-11-04');

/* ================================================================ 7. scheduling decisions */
const base = { ...DEFAULT_REMINDER_SETTINGS, templates: {} };
const pj = (patch: (s: PostJobSettings) => PostJobSettings = (s) => s): PostJobSettings => {
  let s = defaultPostJobSettings();
  for (const k of ['completion', 'warranty', 'maintenance'] as const) s = setPostJobEnabled(s, k, true, '2026-11-01', NOW);
  return patch(s);
};
const decide = (facts: PostJobFacts, now: string, extra: Partial<PostJobDecisionInput> = {}) =>
  decidePostJob({ facts, base, settings: pj(), overrides: {}, paid: true, recorded: [], now: new Date(now), ...extra });
const job = (anchor: string | null): PostJobFacts => ({ kind: 'completion', id: 'job-1', anchor });
const sends = (r: ReturnType<typeof decidePostJob>) => (r.action === 'send' ? r.sends.map((s) => [s.step.audience, s.step.stepKey, s.step.date]) : r.why);

// completed 2026-11-10, default +3 -> 2026-11-13 at 9 AM New York (14:00 UTC)
eq('completion: before the hour', sends(decide(job('2026-11-10'), '2026-11-13T13:59:00Z')), 'nothing_due');
eq('completion: at the hour', sends(decide(job('2026-11-10'), '2026-11-13T14:00:00Z')), [['client', 'done+3', '2026-11-13']]);
eq('completion: within catch-up', sends(decide(job('2026-11-10'), '2026-11-15T14:00:00Z')), [['client', 'done+3', '2026-11-13']]);
eq('completion: missed after catch-up', sends(decide(job('2026-11-10'), '2026-11-16T14:00:00Z')), 'nothing_due');
eq('free plan: never', sends(decide(job('2026-11-10'), '2026-11-13T15:00:00Z', { paid: false })), 'plan');
eq('master switch off', sends(decide(job('2026-11-10'), '2026-11-13T15:00:00Z', { base: { ...base, enabled: false } })), 'paused');
eq('kind off', sends(decide(job('2026-11-10'), '2026-11-13T15:00:00Z', { settings: defaultPostJobSettings() })), 'kind_off');
eq('job completed before switch-on', sends(decide(job('2026-10-30'), '2026-11-02T15:00:00Z')), 'before_since');
eq('job switch OFF', sends(decide(job('2026-11-10'), '2026-11-13T15:00:00Z', { overrides: { job: { enabled: false } } })), 'switched_off');
eq('job switch ON does not enable a kind that is off', sends(decide(job('2026-11-10'), '2026-11-13T15:00:00Z', { settings: defaultPostJobSettings(), overrides: { job: { enabled: true } } })), 'kind_off');
eq('client switch OFF', sends(decide(job('2026-11-10'), '2026-11-13T15:00:00Z', { overrides: { client: { enabled: false } } })), 'nothing_due');
eq('no completion day', sends(decide(job(null), '2026-11-13T15:00:00Z')), 'no_anchor');
const rec = (key: string, status: RecordedReminder['status'], patch: Partial<RecordedReminder> = {}): RecordedReminder => ({ id: `r-${key}`, dedupeKey: key, status, attempts: 1, ...patch });
const k3 = postJobDedupeKey('completion', 'job-1', 'done+3', '2026-11-13');
eq('dedupe key format', k3, 'completion:job-1:done+3:2026-11-13');
eq('never twice: sent', sends(decide(job('2026-11-10'), '2026-11-13T15:00:00Z', { recorded: [rec(k3, 'sent', { sentAt: '2026-11-13T14:00:00Z' })] })), 'nothing_due');
eq('never twice: in flight', sends(decide(job('2026-11-10'), '2026-11-13T15:00:00Z', { recorded: [rec(k3, 'sending')] })), 'nothing_due');
eq('never twice: skipped by the user', sends(decide(job('2026-11-10'), '2026-11-13T15:00:00Z', { recorded: [rec(k3, 'skipped', { reason: 'skipped_by_user' })] })), 'nothing_due');
eq('completion day moved: same step under the old date counts as done',
  sends(decide(job('2026-11-11'), '2026-11-14T15:00:00Z', { recorded: [rec(k3, 'sent', { sentAt: '2026-11-13T14:00:00Z' })] })), 'nothing_due');
const retry = decide(job('2026-11-10'), '2026-11-13T15:00:00Z', { recorded: [rec(k3, 'failed', { reason: 'gmail_rate_limit', attempts: 1 })] });
eq('retryable failure is retried', retry.action === 'send' ? retry.sends[0].retry?.id : null, `r-${k3}`);
eq('non-retryable failure is not', sends(decide(job('2026-11-10'), '2026-11-13T15:00:00Z', { recorded: [rec(k3, 'failed', { reason: 'gmail_rejected' })] })), 'nothing_due');
eq('other kinds\' records do not count', sends(decide(job('2026-11-10'), '2026-11-13T15:00:00Z', { recorded: [rec('maintenance:job-1:done+3:2026-11-13', 'sent', { sentAt: '2026-11-01T00:00:00Z' })] })), [['client', 'done+3', '2026-11-13']]);

// maintenance: completed 2026-11-10 -> +180 = 2027-05-09
const mfacts: PostJobFacts = { kind: 'maintenance', id: 'job-1', anchor: '2026-11-10' };
eq('maintenance steps', planPostJobSteps(mfacts, pj()).map((s) => [s.stepKey, s.date]), [['done+180', '2027-05-09'], ['done+365', '2027-11-10']]);
eq('maintenance due', sends(decide(mfacts, '2027-05-09T15:00:00Z')), [['client', 'done+180', '2027-05-09']]);
eq('maintenance next step', nextPostJobSteps({ facts: mfacts, base, settings: pj(), overrides: {}, paid: true, now: new Date('2026-12-01T15:00:00Z') }).map((s) => s.stepKey), ['done+180']);

// warranty: ends 2027-01-15, client 60/30/7/0, owner 30/0
const wfacts: PostJobFacts = { kind: 'warranty', id: 'war-1', anchor: '2027-01-15' };
eq('warranty steps', planPostJobSteps(wfacts, pj()).map((s) => [s.audience, s.stepKey, s.date]), [
  ['client', 'exp-60', '2026-11-16'], ['client', 'exp-30', '2026-12-16'], ['owner', 'oexp-30', '2026-12-16'], ['client', 'exp-7', '2027-01-08'],
  ['client', 'exp-0', '2027-01-15'], ['owner', 'oexp-0', '2027-01-15'],
]);
eq('warranty 60 days: client only', sends(decide(wfacts, '2026-11-16T15:00:00Z')), [['client', 'exp-60', '2026-11-16']]);
eq('warranty 30 days: client + owner', sends(decide(wfacts, '2026-12-16T15:00:00Z')), [['client', 'exp-30', '2026-12-16'], ['owner', 'oexp-30', '2026-12-16']]);
eq('warranty: client OFF still tells the owner', sends(decide(wfacts, '2026-12-16T15:00:00Z', { overrides: { client: { enabled: false } } })), [['owner', 'oexp-30', '2026-12-16']]);
eq('warranty: document OFF stops both', sends(decide(wfacts, '2026-12-16T15:00:00Z', { overrides: { document: { enabled: false } } })), 'switched_off');
eq('warranty: owner off', sends(decide(wfacts, '2026-12-16T15:00:00Z', { settings: pj((s) => setWarrantyOwner(s, { notifyOwner: false }, NOW)) })), [['client', 'exp-30', '2026-12-16']]);
eq('warranty: void / lifetime = nothing', sends(decide({ ...wfacts, inactive: true }, '2026-12-16T15:00:00Z')), 'no_anchor');
eq('warranty: steps before switch-on are dropped', sends(decide(wfacts, '2026-11-16T15:00:00Z', { settings: pj((s) => ({ ...s, warranty: { ...s.warranty, since: '2026-11-20' } })) })), 'nothing_due');
const owner30 = postJobDedupeKey('warranty', 'war-1', 'oexp-30', '2026-12-16');
eq('warranty: owner sent, client still goes', sends(decide(wfacts, '2026-12-16T15:00:00Z', { recorded: [rec(owner30, 'sent', { sentAt: '2026-12-16T14:00:00Z' })] })), [['client', 'exp-30', '2026-12-16']]);
eq('warranty: extended (new end date) = new steps', sends(decide({ ...wfacts, anchor: '2027-02-14' }, '2027-01-15T15:00:00Z', {
  recorded: [rec(postJobDedupeKey('warranty', 'war-1', 'exp-30', '2026-12-16'), 'sent', { sentAt: '2026-12-16T14:00:00Z' })],
})), [['client', 'exp-30', '2027-01-15'], ['owner', 'oexp-30', '2027-01-15']]);
eq('warranty: gap between client emails', sends(decide({ ...wfacts, anchor: '2026-12-23' }, '2026-12-16T15:00:00Z', {
  settings: pj((s) => setWarrantyOwner(s, { notifyOwner: false }, NOW)),
  recorded: [rec('warranty:war-1:exp-30:2026-11-23', 'sent', { sentAt: '2026-12-16T05:00:00Z' })],
})), 'nothing_due');
eq('step keys', [postJobStepKey('warranty', 'client', 0), postJobStepKey('warranty', 'owner', 30), postJobStepKey('maintenance', 'client', 365)], ['exp-0', 'oexp-30', 'done+365']);

// the database checks (migration 20261116000900) accept every step key the code makes, and still the old ones
const OLD_STEP = /^(due|sent|start)[+-][0-9]{1,3}$/;
const NEW_STEP = /^(done|exp|oexp)[+-][0-9]{1,4}$/;
const allKeys = [
  ...planPostJobSteps(wfacts, pj((s) => setPostJobOffsets(s, 'warranty', [120, 0], NOW))),
  ...planPostJobSteps(mfacts, pj((s) => setPostJobOffsets(s, 'maintenance', [14, 1825], NOW))),
  ...planPostJobSteps(job('2026-11-10'), pj((s) => setPostJobOffsets(s, 'completion', [1, 60], NOW))),
].map((s) => s.stepKey);
ok(`every new step key passes the new check (${allKeys.join(', ')})`, allKeys.every((k) => NEW_STEP.test(k) || OLD_STEP.test(k)));
ok('dedupe keys fit the 200-char column', postJobDedupeKey('maintenance', '00000000-0000-0000-0000-000000000000', 'done+1825', '2031-11-10').length <= 200);

/* ================================================================ 8. messages */
const plainValues = buildPostJobValues({ templateKey: 'completion', stepDate: '2026-11-13', anchor: '2026-11-10', offset: 3, clientName: 'Dana', jobName: 'the deck', company: 'Oak & Nail', myName: 'Sam' });
const noReview = renderPostJob(defaultPostJobSettings(), 'completion', plainValues);
ok('completion: no review line without a link', !/review/i.test(noReview.text));
eq('completion subject', noReview.subject, 'Thank you, Dana');
const withReview = renderPostJob(defaultPostJobSettings(), 'completion', { ...plainValues, review_link: 'https://g.page/r/abc/review' });
ok('completion: review link line', withReview.text.includes('https://g.page/r/abc/review') && withReview.html.includes('href="https://g.page/r/abc/review"'));
const httpReview = buildPostJobValues({ templateKey: 'completion', stepDate: '2026-11-13', anchor: '2026-11-10', offset: 3, reviewLink: 'javascript:alert(1)' });
eq('review link: https only', httpReview.review_link, '');
const wc = renderPostJob(defaultPostJobSettings(), 'warranty_client', buildPostJobValues({ templateKey: 'warranty_client', stepDate: '2026-12-16', anchor: '2027-01-15', offset: 30, clientName: 'Dana', jobName: 'the deck', link: 'https://x.test/?portal=k' }));
eq('warranty client subject', wc.subject, 'Your warranty for the deck ends in 30 days');
ok('warranty client body: end date + how to claim', wc.text.includes('January 15, 2027') && /reply to this email/i.test(wc.text));
const wcToday = buildPostJobValues({ templateKey: 'warranty_client', stepDate: '2027-01-15', anchor: '2027-01-15', offset: 0 });
eq('warranty ends today', wcToday.when, 'today');
const wo = renderPostJob(defaultPostJobSettings(), 'warranty_owner', buildPostJobValues({ templateKey: 'warranty_owner', stepDate: '2026-12-16', anchor: '2027-01-15', offset: 30, number: 'WAR-7', openClaims: 2, clientEmailed: true, link: warrantyAppLink('https://app.test', 'job-1', 'war-1') }));
eq('warranty owner subject', wo.subject, 'Warranty WAR-7 for your client ends in 30 days');
ok('warranty owner: claims + app link', wo.text.includes('Open claims: 2') && wo.text.includes('https://app.test/jobs/job-1/forms/Warranty/war-1'));
const m = renderPostJob(setMaintenanceTip(defaultPostJobSettings(), 'Clean the gutters every fall.', NOW), 'maintenance',
  buildPostJobValues({ templateKey: 'maintenance', stepDate: '2027-05-09', anchor: '2026-11-10', offset: 180, clientName: 'Dana', jobName: 'the roof', tip: 'Clean the gutters every fall.' }));
ok('maintenance: duration + tip', m.text.includes('It has been 6 months since we finished the roof. Clean the gutters every fall.'));
eq('durations', [durationText(180), durationText(365), durationText(730), durationText(90), durationText(45), durationText(545)], ['6 months', '1 year', '2 years', '3 months', '45 days', '18 months']);
eq('when text', [whenText(30), whenText(1), whenText(0)], ['in 30 days', 'tomorrow', 'today']);
const custom = renderPostJob(setPostJobTemplate(defaultPostJobSettings(), 'completion', { subject: 'Thanks {client}!', body: 'Hi {client}' }, NOW), 'completion', plainValues);
eq('custom wording', [custom.subject, custom.text], ['Thanks Dana!', 'Hi Dana']);
for (const key of POST_JOB_TEMPLATE_KEYS) {
  const t2 = POST_JOB_TEMPLATES[key];
  const used = [...`${t2.subject}\n${t2.body}`.matchAll(/\{([a-z_]+)\}/g)].map((x) => x[1]);
  ok(`${key}: every placeholder is documented`, used.every((n) => (POST_JOB_TEMPLATE_PLACEHOLDERS[key] as string[]).includes(n)));
  ok(`${key}: no brand names`, !/contractordocs|kelviq|merchant of record/i.test(`${t2.subject} ${t2.body}`));
}
ok('owner link: rejects a non-https site', warrantyAppLink('javascript:x', 'j', 'd') === '');
// old templates unchanged by the review_link line rule
eq('invoice template fill unchanged', fillTemplate(DEFAULT_TEMPLATES.visit.body, { client: 'Dana', job: 'the deck', visit_date: 'Friday', my_name: '', company: 'Co' }).split('\n')[0], 'Hi Dana,');

/* ================================================================ 9. the dispatch loop with the new kinds */
async function dispatchCheck() {
  const claimed = new Set<string>();
  const sentTo: string[] = [];
  const log: string[] = [];
  const deps: DispatchDeps = {
    allowance: () => ({ paid: true, used: 0, limit: null }),
    recordSkip: async (item, reason) => { log.push(`skip ${item.kind} ${reason}`); },
    claim: async (item) => {
      if (claimed.has(item.dedupeKey)) return null;
      claimed.add(item.dedupeKey);
      return { id: `c-${claimed.size}`, attempts: 1 } as Claim;
    },
    send: async (item) => { sentTo.push(`${item.kind}:${item.to}`); return { messageId: 'm' }; },
    markSent: async () => {},
    markFailed: async () => {},
    recordUsage: async () => {},
  };
  const item = (kind: OutgoingReminder['kind'], key: string, to: string | null): OutgoingReminder => ({
    userId: 'u1', kind, documentId: kind === 'warranty' ? 'war-1' : null, jobId: 'job-1', clientId: null, stepKey: 'done+3', scheduledFor: '2026-11-13',
    dedupeKey: key, retry: null, to, block: null, accountId: 'a1', subject: 's', text: 't', html: 'h',
  });
  const items = [
    item('completion', 'completion:job-1:done+3:2026-11-13', 'dana@example.com'),
    item('completion', 'completion:job-1:done+3:2026-11-13', 'dana@example.com'),
    item('warranty', 'warranty:war-1:exp-30:2026-12-16', 'dana@example.com'),
    item('warranty', 'warranty:war-1:oexp-30:2026-12-16', 'me@example.com'),
    item('maintenance', 'maintenance:job-1:done+180:2027-05-09', null),
  ];
  const s1 = await dispatchReminders(items, deps);
  const s2 = await dispatchReminders(items, deps);
  eq('dispatch: sent once each, owner note to the owner', sentTo, ['completion:dana@example.com', 'warranty:dana@example.com', 'warranty:me@example.com']);
  eq('dispatch: duplicate in a run = taken', [s1.sent, s1.taken, s1.skipped], [3, 1, 1]);
  eq('dispatch: second run sends nothing', s2.sent, 0);
  eq('dispatch: no client email = logged skip', log[0], 'skip maintenance no_email');
}

/* ================================================================ 10. static scan: migration + wiring */
function staticChecks() {
  const sql = read('supabase/migrations/20261116000900_reminder_kinds_warranty.sql');
  ok('migration: header says applied with the owner OK', sql.includes("Applied 2026-11-15 with the owner's OK"));
  ok('migration: no new table', !/create\s+table/i.test(sql));
  ok('migration: no new column', !/add\s+column/i.test(sql));
  ok('migration: no drop table / function', !/drop\s+(table|function)/i.test(sql));
  ok('migration: kind check widened (old kinds kept)', /check \(kind in \('invoice', 'estimate', 'visit', 'completion', 'warranty', 'maintenance'\)\)/.test(sql));
  ok('migration: step check keeps the old rule', sql.includes("step_key ~ '^(due|sent|start)[+-][0-9]{1,3}$' or step_key ~ '^(done|exp|oexp)[+-][0-9]{1,4}$'"));
  ok('migration: constraints dropped if exists before add', sql.includes('drop constraint if exists reminders_kind_check') && sql.includes('drop constraint if exists reminders_step_key_check'));
  const fns = [...sql.matchAll(/create or replace function[\s\S]*?\n\$\$;/g)].map((x) => x[0]);
  ok('migration: one function', fns.length === 1);
  for (const f of fns) {
    ok('function: security definer', /\bsecurity definer\b/.test(f));
    ok("function: search_path = ''", f.includes("set search_path = ''"));
    ok('function: body opens with as $$', /\nas \$\$\n/.test(f));
  }
  // skip_reminder: the original body is preserved line for line apart from the three widened lines
  const orig = read('supabase/migrations/20261113000300_reminders.sql');
  const origFn = /create or replace function public\.skip_reminder[\s\S]*?\n\$\$;/.exec(orig)?.[0] ?? '';
  const newFn = /create or replace function public\.skip_reminder[\s\S]*?\n\$\$;/.exec(sql)?.[0] ?? '';
  const changed = origFn.split('\n').filter((l) => !newFn.split('\n').includes(l));
  eq('skip_reminder: only the kind / step / target lines differ', changed.map((l) => l.trim().slice(0, 40).trim()), [
    "if v_kind not in ('invoice', 'estimate',",
    "or coalesce(p_step_key, '') !~ '^(due|se",
    "if v_kind = 'visit' then",
    "and d.type = case v_kind when 'invoice'",
    "values (v_uid, v_kind, case when v_kind",
  ]);
  ok('migration: grants re-stated', sql.includes('revoke all on function public.skip_reminder(text, uuid, text, date) from public, anon, authenticated;')
    && sql.includes('grant execute on function public.skip_reminder(text, uuid, text, date)   to authenticated;'));
  ok('migration: idempotent (no plain add without drop)', (sql.match(/add constraint/g) ?? []).length === (sql.match(/drop constraint if exists/g) ?? []).length);

  const index = read('supabase/functions/reminders/index.ts');
  ok('edge function: post-job planned in the same run + dispatch', index.includes("import { planPostJobBatch } from './postjob.ts';") && index.includes('planPostJobBatch(admin, contexts, now, SITE_URL)'));
  ok('edge function: cron secret check unchanged', index.includes("req.headers.get('x-reminders-secret')") && index.includes('verifyCronSecret'));
  const serverPj = read('supabase/functions/reminders/postjob.ts');
  ok('server: paid plans only', serverPj.includes('c.allowance.paid'));
  ok('server: settings key', serverPj.includes('POST_JOB_SETTING'));
  eq('settings key', POST_JOB_SETTING, 'reminders.postjob');
  ok('settings key allowed by user_settings check', /^[a-z0-9_.:-]{1,64}$/.test(POST_JOB_SETTING));
  ok('userData.ts uses the same key', read('lib/userData.ts').includes(`const POST_JOB_SETTING_KEY = '${POST_JOB_SETTING}';`));
  // existing kinds: defaults untouched
  eq('old reminder defaults unchanged', [DEFAULT_REMINDER_SETTINGS.invoice, DEFAULT_REMINDER_SETTINGS.estimate, DEFAULT_REMINDER_SETTINGS.visit],
    [{ enabled: true, offsets: [0, 7, 14] }, { enabled: true, offsets: [3, 7] }, { enabled: false, offsets: [-1] }]);
  eq('automations: the three reminder bindings unchanged', BOUND_ROWS.filter((r) => r.binding.type === 'reminder').map((r) => (r.binding as { kind: string }).kind).sort(), ['estimate', 'invoice', 'visit']);
  eq('automations: post-job rows', POST_JOB_ROWS.map((r) => r.binding.kind), ['completion', 'warranty', 'maintenance']);
  ok('automations: post-job rows are Premium + in Jobs', POST_JOB_ROWS.every((r) => r.premium && r.group === 'jobs'));
  ok('automations: ids unique', new Set([...BOUND_ROWS.map((r) => r.id), ...POST_JOB_ROWS.map((r) => r.id)]).size === BOUND_ROWS.length + POST_JOB_ROWS.length);
  ok('warranty api: no new write path (normal document upsert)', !/from\('documents'\)\.(insert|update|upsert|delete)/.test(read('lib/warranty/warrantyApi.ts')));
}

/* ================================================================ 6. phase B: the screens' pure logic (lib/warranty/warrantyView.ts, postJobPlan.ts) */
type D = Record<string, unknown>;
const dataOf = (r: unknown): D => (r as { data: D }).data;

function viewChecks() {
  eq('formatDay', [formatDay('2028-03-12'), formatDay('2026-01-05'), formatDay(''), formatDay('x'), formatDay(null)], ['12 Mar 2028', '5 Jan 2026', '', '', '']);
  eq('timeLeftText', [timeLeftText(120), timeLeftText(25), timeLeftText(365), timeLeftText(1), timeLeftText(-45), timeLeftText(59), timeLeftText(60), timeLeftText(631), timeLeftText(731), timeLeftText(0)],
    ['4 months', '25 days', '1 year', '1 day', '45 days', '59 days', '2 months', '1 year and 9 months', '2 years', '1 day']);
  eq('durationLabel', [durationLabel(2, 'years'), durationLabel(1, 'years'), durationLabel(90, 'days'), durationLabel(6, 'months'), durationLabel(1, 'months')],
    ['2 Years', '1 Year', '90 Days', '6 Months', '1 Month']);
  ok('durationLabel is read back by the logic', (['days', 'months', 'years'] as const).every((u) => {
    const p = parseDurationText(durationLabel(3, u));
    return !!p && 'value' in p && p.value === 3 && p.unit === u;
  }));

  // the status line
  const base: D = { warrantyNumber: 'WAR-1', completedDate: '2026-11-15', duration: '2 Years' };
  const sumOf = (data: D, today: string) => warrantySummary(overviewOfDocument(data, null, today));
  eq('summary active', sumOf(base, '2026-11-15'), { tone: 'good', text: 'Active, ends 15 Nov 2028 (2 years left)', short: 'Ends 15 Nov 2028' });
  eq('summary expiring', sumOf({ ...base, duration: '90 Days' }, '2027-01-20').text, 'Ending soon, ends 13 Feb 2027 (24 days left)');
  eq('summary ends today', sumOf({ ...base, duration: '1 Year' }, '2027-11-15').text, 'Ending soon, ends today (15 Nov 2027)');
  eq('summary expired', sumOf({ ...base, duration: '1 Year' }, '2028-04-15').text, 'Ended 15 Nov 2027 (5 months ago)');
  eq('summary lifetime', sumOf({ ...base, duration: 'Lifetime' }, '2026-11-20'), { tone: 'good', text: 'Lifetime, no end date', short: 'Lifetime' });
  eq('summary unknown', sumOf({ ...base, duration: 'see contract' }, '2026-11-20').tone, 'muted');
  eq('summary void', sumOf({ ...base, warrantyTracking: { v: 1, voidedAt: '2027-02-03T10:00:00Z', claims: [] } }, '2027-03-01').text, 'Void since 3 Feb 2027');

  // coverage edits
  const old: D = { ...base };
  const o0 = overviewOfDocument(old, null, '2026-11-20');
  eq('old warranty: mode and length come from the duration text', [coverageMode(o0), lengthOf(o0)], ['length', { value: 2, unit: 'years' }]);
  ok('old warranty: nothing is stored until an edit', !('warrantyTracking' in old));
  const r1 = applyCoverage(old, { mode: 'length', value: 3, unit: 'months' });
  ok('length edit ok', !isFailure(r1));
  const d1 = dataOf(r1);
  eq('length edit: tracking and printed duration', [(d1.warrantyTracking as WarrantyTracking).termValue, (d1.warrantyTracking as WarrantyTracking).termUnit, d1.duration], [3, 'months', '3 Months']);
  eq('length edit: other fields kept', [d1.warrantyNumber, d1.completedDate], ['WAR-1', '2026-11-15']);
  eq('length edit: end date', warrantyOverview(d1, '2026-11-20').expiresOn, '2027-02-15');
  const d2 = dataOf(applyCoverage(d1, { mode: 'date', expiresOn: '2029-01-31' }));
  eq('date edit: exact end, printed duration untouched', [warrantyOverview(d2, '2026-11-20').expiresOn, d2.duration, (d2.warrantyTracking as WarrantyTracking).termValue ?? null], ['2029-01-31', '3 Months', null]);
  eq('mode of an exact end date', coverageMode(overviewOfDocument(d2, null, '2026-11-20')), 'date');
  const d3 = dataOf(applyCoverage(d2, { mode: 'lifetime' }));
  eq('lifetime edit', [warrantyOverview(d3, '2026-11-20').status, d3.duration, (d3.warrantyTracking as WarrantyTracking).expiresOn ?? null], ['lifetime', 'Lifetime', null]);
  const bad = applyCoverage(old, { mode: 'date', expiresOn: '2026-01-01' });
  ok('end before start refused', isFailure(bad) && bad.field === 'expiresOn');
  ok('length 0 refused', isFailure(applyCoverage(old, { mode: 'length', value: 0, unit: 'years' })));
  ok('length too big refused', isFailure(applyCoverage(old, { mode: 'length', value: 99, unit: 'years' })));
  const d4 = dataOf(applyCoverage(old, { mode: 'length', value: 2, unit: 'years', startDate: '2026-12-01' }));
  eq('own start date', warrantyOverview(d4, '2026-12-02').expiresOn, '2028-12-01');
  const d5 = dataOf(applyCoverage(d4, { mode: 'length', value: 2, unit: 'years', startDate: null }));
  eq('start date cleared = the completed day again', warrantyOverview(d5, '2026-12-02').expiresOn, '2028-11-15');
  const claimed = voidWarranty(tracked(addClaim(emptyTracking(), { id: 'k1', date: '2026-11-16', description: 'Leak' }, NOW, '2026-11-16')), new Date('2027-01-01T00:00:00Z'));
  const keep = dataOf(applyCoverage(withWarrantyTracking(old, claimed), { mode: 'length', value: 5, unit: 'years' }));
  eq('claims and void survive a coverage edit', [readWarrantyTracking(keep).claims.length, !!readWarrantyTracking(keep).voidedAt], [1, true]);

  // typing in the old Duration box
  eq('duration text, nothing structured: only the text changes', applyDurationText(old, '5 Years'), { ...old, duration: '5 Years' });
  const t1 = applyDurationText(d1, '2 Years');
  eq('duration text with a structured length: the structure follows', [t1.duration, (t1.warrantyTracking as WarrantyTracking).termValue, (t1.warrantyTracking as WarrantyTracking).termUnit], ['2 Years', 2, 'years']);
  const t2 = applyDurationText(d1, '1 year labor / 10 years roof');
  eq('duration text it cannot read: printed as written, the structure governs', [t2.duration, (t2.warrantyTracking as WarrantyTracking).termValue, warrantyOverview(t2, '2026-11-20').expiresOn], ['1 year labor / 10 years roof', 3, '2027-02-15']);
  const t3 = applyDurationText(d2, '10 Years');
  eq('duration text with an exact end date: only the text changes', [t3.duration, warrantyOverview(t3, '2026-11-20').expiresOn], ['10 Years', '2029-01-31']);
  const t4 = applyDurationText(d1, 'Lifetime');
  eq('duration text Lifetime with a structured length', [warrantyOverview(t4, '2026-11-20').status, t4.duration], ['lifetime', 'Lifetime']);

  // claim buttons = the state machine, nothing else
  for (const from of Object.keys(CLAIM_TRANSITIONS) as Array<keyof typeof CLAIM_TRANSITIONS>) {
    eq(`claim moves from ${from}`, claimMoves(from).map((m) => m.to), CLAIM_TRANSITIONS[from]);
  }
  eq('claim move labels', [...claimMoves('open'), ...claimMoves('resolved'), ...claimMoves('in_review')].map((m) => m.label),
    ['Start review', 'Mark resolved', 'Deny claim', 'Reopen', 'Back to open', 'Mark resolved', 'Deny claim']);
  eq('closing moves', claimMoves('open').filter((m) => m.closes).map((m) => m.to), ['resolved', 'denied']);
  eq('only a denial needs a reason', [claimNeedsReason('denied'), claimNeedsReason('resolved'), claimNeedsReason('open')], [true, false, false]);
  const closed = tracked(moveClaim(tracked(addClaim(emptyTracking(), { id: 'z1', date: '2026-11-10', description: 'x' }, NOW, TODAY)), 'z1', 'resolved', { resolution: 'Re-grouted', resolvedOn: '2026-11-14', now: NOW, today: TODAY })).claims[0];
  eq('claim chip text', [claimChipText(closed), claimChipText({ status: 'open', resolvedOn: null }), claimChipText({ status: 'in_review', resolvedOn: null })], ['Resolved 14 Nov 2026', 'Open', 'In review']);
  const cs = (claims: unknown[]) => ({ claims: claimsSummary(parseTracking({ claims }).claims) });
  eq('open claims text', [
    openClaimsText(cs([])),
    openClaimsText(cs([{ id: 'a', date: '2026-11-01' }])),
    openClaimsText(cs([{ id: 'a', date: '2026-11-01' }, { id: 'b', date: '2026-11-02', status: 'in_review' }, { id: 'c', date: '2026-11-03', status: 'resolved' }])),
  ], ['', '1 open claim', '2 open claims']);

  // the warranties list
  const item = (id: string, data: D) => ({ id, overview: overviewOfDocument(data, null, '2026-11-20') });
  const open1 = { v: 1, claims: [{ id: 'a', date: '2026-11-01', description: 'x', status: 'open' }] };
  const list = [
    item('far', { completedDate: '2026-11-15', duration: '5 Years' }),
    item('soon', { completedDate: '2026-01-15', duration: '1 Year' }),
    item('soon-claim', { completedDate: '2026-01-17', duration: '1 Year', warrantyTracking: open1 }),
    item('old', { completedDate: '2024-01-15', duration: '1 Year' }),
    item('void', { completedDate: '2026-01-15', duration: '1 Year', warrantyTracking: { v: 1, voidedAt: '2026-05-01T00:00:00Z', claims: [] } }),
    item('life', { completedDate: '2026-01-15', duration: 'Lifetime' }),
    item('nodate', { completedDate: '2026-01-15', duration: 'see contract' }),
  ];
  eq('buckets: order and members (open claim first, then soonest end)', warrantyBuckets(list).map((b) => [b.id, b.items.map((i) => i.id)]), [
    ['expiring', ['soon-claim', 'soon']], ['active', ['far', 'life', 'nodate']], ['ended', ['old']], ['void', ['void']],
  ]);
  eq('buckets: empty groups left out', warrantyBuckets([list[0]]).map((b) => b.id), ['active']);
  const stale = overviewOfDocument({ completedDate: '2026-11-15', duration: '1 Year' }, null, '2026-11-20');
  eq('a list copied on an earlier day is brought up to date', [refreshOverview(stale, '2027-10-01').status, refreshOverview(stale, '2027-10-01').daysLeft, refreshOverview(stale, '2028-01-01').status], ['expiring', 45, 'expired']);

  // the days boxes of the settings
  eq('offsetsText', offsetsText([60, 30, 7, 0]), '60, 30, 7, 0');
  eq('warranty days, farthest first', parseOffsetsText('warranty', '7, 30 60 0'), { offsets: [60, 30, 7, 0], problem: null });
  eq('completion days', parseOffsetsText('completion', '3'), { offsets: [3], problem: null });
  eq('maintenance days', parseOffsetsText('maintenance', '365; 180'), { offsets: [180, 365], problem: null });
  ok('empty refused', parseOffsetsText('completion', '').problem !== null);
  ok('letters refused', parseOffsetsText('completion', 'three').problem !== null);
  ok('out of range refused', parseOffsetsText('completion', '90').problem !== null && parseOffsetsText('maintenance', '5').problem !== null);
  ok('too many refused', parseOffsetsText('completion', '1, 2, 3').problem !== null);
  const def = defaultPostJobSettings();
  eq('warranty schedule sentence', warrantyScheduleText(def), 'The client is emailed 60, 30 and 7 days before it ends and on the day it ends. You get a note 30 days before it ends and on the day it ends.');
  eq('warranty schedule without the owner note', warrantyScheduleText(setWarrantyOwner(def, { notifyOwner: false }, 1)), 'The client is emailed 60, 30 and 7 days before it ends and on the day it ends.');
  eq('audience labels', AUDIENCE_LABELS, { client: 'Client', owner: 'You' });

  // "Next scheduled": planned by the server's own planner
  const NOWD = new Date('2026-11-15T15:00:00Z');
  const baseR = { enabled: true, sendHour: 9, timezone: 'UTC', paid: true };
  const on = setPostJobEnabled(def, 'warranty', true, '2026-11-01', 1);
  const noOv = { document: null, job: null, client: null };
  const wTargets: UpcomingTarget[] = [
    { facts: { kind: 'warranty', id: 'w1', anchor: '2027-01-15' }, client: 'Kim', job: 'Warranty WAR-1', overrides: noOv },
    { facts: { kind: 'warranty', id: 'w2', anchor: '2027-01-15', inactive: true }, client: 'Lee', job: 'Warranty WAR-2', overrides: noOv },
    { facts: { kind: 'warranty', id: 'w3', anchor: '2027-02-01' }, client: 'Sam', job: 'Warranty WAR-3', overrides: { ...noOv, document: { enabled: false, updatedAt: null } } },
  ];
  const up = planUpcoming('warranty', on, baseR, '2026-11-15', NOWD, wTargets, 10);
  ok('upcoming: not a preview when on', !up.preview);
  eq('upcoming warranty: only w1 (void/lifetime and switched-off ones skipped), next client step then next owner step', up.items.map((i) => [i.date, i.audience, i.targetId, i.label]), [
    ['2026-11-16', 'client', 'w1', '60 days before it ends'],
    ['2026-12-16', 'owner', 'w1', '30 days before it ends'],
  ]);
  eq('upcoming: limit', planUpcoming('warranty', on, baseR, '2026-11-15', NOWD, wTargets, 1).items.length, 1);
  const off = planUpcoming('warranty', def, baseR, '2026-11-15', NOWD, wTargets.slice(0, 1), 10);
  ok('upcoming while off: a preview of switching on today', off.preview && off.items.length > 0 && off.items.every((i) => i.date >= '2026-11-15'));
  eq('upcoming: Free plan plans nothing', planUpcoming('warranty', on, { ...baseR, paid: false }, '2026-11-15', NOWD, wTargets, 10).items, []);
  eq('upcoming: paused reminders plan nothing', planUpcoming('warranty', on, { ...baseR, enabled: false }, '2026-11-15', NOWD, wTargets, 10).items, []);
  const cOn = setPostJobEnabled(def, 'completion', true, '2026-11-10', 1);
  const jTargets: UpcomingTarget[] = [
    { facts: { kind: 'completion', id: 'j1', anchor: '2026-11-14' }, client: 'Kim', job: 'Bathroom', overrides: noOv },
    { facts: { kind: 'completion', id: 'j2', anchor: '2026-11-01' }, client: 'Old', job: 'Before the switch', overrides: noOv },
  ];
  eq('upcoming completion: only the job completed after switching on', planUpcoming('completion', cOn, baseR, '2026-11-15', NOWD, jTargets, 5).items.map((i) => [i.targetId, i.date]), [['j1', '2026-11-17']]);
}
viewChecks();

/* ================================================================ 7. phase B wiring (text scan) */
function viewStaticChecks() {
  const help = read('components/help/helpContent.ts');
  ok('help: both guides exist and are typed', help.includes("id: 'warranty-tracking'") && help.includes("id: 'after-job-emails'") && help.includes("'warranty-tracking' | 'after-job-emails'"));
  ok('help: no Kelviq / merchant of record', !/kelviq|merchant of record/i.test(help.slice(help.indexOf("id: 'warranty-tracking'"), help.indexOf("id: 'inventory'"))));
  const form = read('components/WarrantyForm.tsx');
  ok('form: coverage, claims and emails sections mounted', ['WarrantyCoverageSection', 'WarrantyClaimsSection', 'WarrantyEmailsSection'].every((n) => form.includes(`<${n}`)));
  ok('form: old fields still there', ['Warranty #', 'Work completed on', 'label="Duration"', 'Conditions & exclusions', 'generateWarrantyPDF'].every((x) => form.includes(x)));
  ok('form: validation unchanged', form.includes("'Add a warranty number.'") && form.includes("'Add the completion date.'"));
  ok('form: no write path of its own', !/supabase|upsertDocumentRecord/.test(form));
  const sections = ['WarrantyCoverageSection', 'WarrantyClaimsSection', 'WarrantyEmailsSection', 'WarrantiesStrip'].map((n) => read(`components/warranty/${n}.tsx`)).join('\n');
  ok('components: no direct documents write', !/from\('documents'\)|upsertDocumentRecord|updateWarrantyTracking/.test(sections));
  ok('components: never mention Kelviq', !/kelviq|merchant of record/i.test(sections + read('components/automations/PostJobRows.tsx')));
  const rows = read('components/automations/AutomationsSettings.tsx');
  ok('automations: post-job rows mounted in Jobs once reminders are ready', rows.includes('<PostJobRows') && rows.includes("g.id === 'jobs' && rem.state.status === 'ready'"));
  ok('automations: existing rows untouched', rows.includes('{rules.map(ruleRow)}') && rows.includes('{bound.map(boundRow)}') && rows.includes('{always.map(a => ('));
  const pj = read('components/automations/PostJobRows.tsx');
  ok('post-job rows: POST_JOB_ROWS + the settings helpers', ['POST_JOB_ROWS', 'setPostJobEnabled', 'setPostJobOffsets', 'setWarrantyOwner', 'setCompletionReview', 'setMaintenanceTip', 'setPostJobTemplate', 'previewPostJobEmail', 'loadUpcomingPostJob'].every((n) => pj.includes(n)));
  ok('post-job rows: Free gets the upgrade prompt', pj.includes('if (!paid) { onUpgradeClick?.(); return; }'));
  ok('job page: warranties strip in the Documents tab', read('components/JobDetailsScreen.tsx').includes('<WarrantiesStrip'));
  const audit = read('lib/offline/writePathAudit.ts');
  ok('offline audit lists the claim photo writes', audit.includes('storage.from(CLAIM_PHOTO_BUCKET).upload(path, upload') && audit.includes('storage.from(CLAIM_PHOTO_BUCKET).remove([path])'));
  const photos = read('lib/warranty/claimPhotos.ts');
  ok('claim photos: private bucket, owner folder, signed links only', photos.includes("'document-assets'") && photos.includes('createSignedUrl') && photos.includes('`${userId}/warranty/'));
  ok('claim photos: no public URL', !photos.includes('getPublicUrl'));
  const path = '0d3c1f6e-1111-4222-8333-444455556666/warranty/9a8b7c6d-1111-4222-8333-444455556666/ab12cd34ef56-Leak-photo.jpg';
  eq('claim photo path passes the claim parser', parseTracking({ claims: [{ id: 'a', date: '2026-11-01', photos: [path] }] }).claims[0].photos, [path]);
  const view = read('lib/warranty/warrantyView.ts').replace(/\/\*[\s\S]*?\*\//g, '');
  ok('view logic stays pure (no Supabase client / React)', !/from '\.\.\/supabase\.ts'|from 'react'/.test(view));
}
viewStaticChecks();

await dispatchCheck();
staticChecks();

console.log(`${failures ? 'FAILED' : 'OK'}: ${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
