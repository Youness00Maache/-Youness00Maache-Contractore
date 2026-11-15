/**
 * Automation rules (roadmap batch N12, Settings > Automations). Pure logic and wiring lint; no database, no network:
 *   npx tsx scripts/automations-check.ts
 *
 * Covers: the rule list (ids, defaults, tiers, tools), the saved choices (shape, migration of missing keys, bad values,
 * newest-copy-wins, "do it for me" start time, Free-plan hold-back), what the rules remember (jobs seen completed, drafts
 * made: bounded, merged), every rule's trigger / dedupe / default / gating, the bell integration (one category, read and
 * removed state keeps a note gone), the two drafts (always Draft, unique numbers), the bindings to the existing
 * settings (bell types, reminder emails, defaults unchanged), and the wiring (Settings section, engine, help guide,
 * nothing that sends / edits / deletes).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    ALWAYS_ON, AUTOMATION_DONE_SETTING, AUTOMATION_PREFS_SETTING, AUTOMATION_SEEN_SETTING, BOUND_ROWS, GROUPS, RULES, RULE_IDS,
    defaultAutomationPrefs, isPaid, newerAutomationPrefs, parseAutomationPrefs, resolveAll, resolveRule, ruleAvailable, ruleDef,
    sameAutomationPrefs, setRuleDays, setRuleMode, setRuleOn, type AutomationPrefs, type ResolvedRule,
} from '../lib/automations/rules.ts';
import {
    DONE_KEEP_DAYS, DONE_MAX, SEEN_MAX_BASE, SEEN_MAX_FRESH, STATE_MAX_CHARS, autoKey, emptyDone, emptySeen, freshCompletedAt, mergeDone, mergeSeen,
    parseDone, parseSeen, pruneDone, recordDone, trackJobs, type DoneEntry, type DoneLog, type SeenJobs,
} from '../lib/automations/state.ts';
import {
    EVENT_DAYS, MAX_PER_RULE, MAX_TASKS_NAMED, LEAD_LATE_DAYS, evalClientReply, evalEstimateApproved, evalEstimateWaiting, evalJobCompleted,
    evalLeadFollowUp, evalTaskOverdue, type EstimateRef, type JobRef, type LeadRef, type ReplyRef, type TaskRef,
} from '../lib/automations/evaluate.ts';
import { buildInvoiceDraft, buildWarrantyDraft } from '../lib/automations/drafts.ts';
import {
    KIND_META, NOTIFICATION_CATEGORIES, buildNotifications, defaultPrefs, dismiss, emptyState, markRead, notificationKey, setCategory,
    type AppNotification, type NotificationKind,
} from '../lib/notifications/model.ts';
import { DEFAULT_REMINDER_SETTINGS } from '../supabase/functions/reminders/shared/schedule.ts';
import { HELP_GUIDES, getGuide } from '../components/help/helpContent.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
let checks = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); checks++; };
const eq = <T,>(a: T, b: T, msg: string) => { assert.deepEqual(a, b, msg); checks++; };

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 16, 10, 0, 0).getTime(); // Mon 2026-11-16, 10:00 local
const TODAY = '2026-11-16';
const ctx = { now: NOW };
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const secAgo = (days: number) => Math.floor((NOW - days * DAY) / 1000);

const on = (id: Parameters<typeof resolveRule>[0], patch: Partial<ResolvedRule> = {}): ResolvedRule => ({ ...resolveRule(id, defaultAutomationPrefs(), 'free'), on: true, ...patch });
const draftRule = (id: Parameters<typeof resolveRule>[0], since: number): ResolvedRule => ({ ...on(id), chosenMode: 'draft', mode: 'draft', since });
const idsOf = (items: AppNotification[]) => items.map(i => i.id);

// ---------------------------------------------------------------------------------------------------------------------
// 1. the rule list
// ---------------------------------------------------------------------------------------------------------------------
{
    eq(RULE_IDS, ['estimate_approved_invoice', 'estimate_waiting', 'task_overdue', 'job_completed_warranty', 'lead_followup', 'client_reply'], 'the six new rules');
    ok(new Set(RULE_IDS).size === RULES.length, 'rule ids are unique');
    ok(RULES.every(r => r.title && r.when && r.then.notify && r.then.draft), 'every rule has a title and a when / then sentence');
    ok(RULES.every(r => !/kelviq|merchant of record/i.test(JSON.stringify(r))), 'no forbidden words');
    ok(RULES.every(r => r.group === 'money' || r.group === 'jobs' || r.group === 'leads'), 'rules sit in the groups');
    eq(GROUPS.map(g => g.label), ['Money', 'Jobs', 'Leads & clients', 'Stock & supplies'], 'the four groups, in order');

    // defaults (owner): 1 + 2 notify and on; 3, 4, 5 on when their tool is ready; 6 off with 7 days
    const d = (id: Parameters<typeof ruleDef>[0]) => ruleDef(id);
    ok(d('estimate_approved_invoice').defaultOn && d('estimate_approved_invoice').defaultMode === 'notify', 'estimate approved: on, just tell me');
    ok(d('job_completed_warranty').defaultOn && d('job_completed_warranty').defaultMode === 'notify', 'job completed: on, just tell me');
    ok(d('task_overdue').defaultOn && d('task_overdue').tool === 'tasks', 'task overdue: on, needs Tasks');
    ok(d('lead_followup').defaultOn && d('lead_followup').tool === 'leads', 'lead follow-up: on, needs Leads');
    ok(d('client_reply').defaultOn && d('client_reply').tool === 'questions', 'client answers: on, needs client questions');
    ok(!d('estimate_waiting').defaultOn && d('estimate_waiting').defaultDays === 7 && eqArr(d('estimate_waiting').dayChoices, [3, 7, 14]), 'estimate waiting: off, 7 days, 3 / 7 / 14');
    ok(RULES.filter(r => r.modes.includes('draft')).map(r => r.id).join() === 'estimate_approved_invoice,job_completed_warranty', '"do it for me" only on the two rules that make a document');
    ok(RULES.every(r => r.modes.includes(r.defaultMode)), 'the default mode is always offered');

    // tools: a rule whose tool isn't ready is not available (hidden and silent)
    const ready = { tasks: 'ready', leads: 'ready', questions: 'ready' } as const;
    ok(RULES.every(r => ruleAvailable(r, ready)), 'all rules available when every tool is ready');
    ok(!ruleAvailable(ruleDef('task_overdue'), { ...ready, tasks: 'missing' }) && !ruleAvailable(ruleDef('task_overdue'), { ...ready, tasks: 'unknown' }), 'tasks missing / unknown: no task rule');
    ok(!ruleAvailable(ruleDef('lead_followup'), { ...ready, leads: 'unknown' }) && !ruleAvailable(ruleDef('client_reply'), { ...ready, questions: 'missing' }), 'leads / questions not ready: silent');
    ok(ruleAvailable(ruleDef('estimate_approved_invoice'), { tasks: 'missing', leads: 'missing', questions: 'missing' }), 'rules without a tool never wait for one');
}
function eqArr(a: readonly number[] | undefined, b: readonly number[]) { return JSON.stringify(a) === JSON.stringify(b); }

// ---------------------------------------------------------------------------------------------------------------------
// 2. the saved choices
// ---------------------------------------------------------------------------------------------------------------------
{
    const p0 = defaultAutomationPrefs();
    eq(p0, { v: 1, at: 0, rules: {} }, 'nothing saved = defaults');
    const all = resolveAll(p0, 'free');
    ok(all.task_overdue.on && all.estimate_approved_invoice.on && !all.estimate_waiting.on && all.estimate_waiting.days === 7, 'resolved defaults');
    ok(RULE_IDS.every(id => all[id].mode === 'notify'), 'every rule just tells by default');
    ok(RULE_IDS.every(id => !Number.isFinite(all[id].since)), 'no start time until "do it for me" is chosen');

    // migration of missing keys: an old / partial / odd value keeps the defaults it does not mention
    eq(parseAutomationPrefs(null), p0, 'null -> defaults');
    eq(parseAutomationPrefs('not json'), p0, 'garbage text -> defaults');
    eq(parseAutomationPrefs([1, 2]), p0, 'array -> defaults');
    eq(parseAutomationPrefs({ v: 1 }), p0, 'no rules key -> defaults');
    eq(parseAutomationPrefs(JSON.stringify({ v: 1, at: 5, rules: { task_overdue: { on: false } } })), { v: 1, at: 5, rules: { task_overdue: { on: false } } }, 'a JSON string value parses');
    const odd = parseAutomationPrefs({
        v: 9, at: -3,
        rules: {
            nonsense: { on: true },
            task_overdue: { on: 'yes', mode: 'draft', days: 7, since: 'x' },
            estimate_waiting: { on: true, days: 5 },
            estimate_approved_invoice: { mode: 'sometimes', since: 1700000000000 },
            job_completed_warranty: { mode: 'draft', since: 1700000000001, extra: 1 },
            client_reply: 'on',
        },
    });
    eq(odd.rules, { estimate_waiting: { on: true }, job_completed_warranty: { mode: 'draft', since: 1700000000001 }, estimate_approved_invoice: { since: 1700000000000 } }, 'unknown rules / modes a rule does not offer / bad days / bad types are dropped, the rest kept');
    eq(odd.at, 0, 'a negative time is dropped');
    eq(resolveRule('estimate_waiting', parseAutomationPrefs({ rules: { estimate_waiting: { on: true } } }), 'free').days, 7, 'days missing = 7');
    eq(resolveRule('task_overdue', parseAutomationPrefs({ rules: { estimate_waiting: { on: true } } }), 'free').on, true, 'a rule not mentioned keeps its default');

    // changes
    const p1 = setRuleOn(p0, 'task_overdue', false, 1000);
    ok(!resolveRule('task_overdue', p1, 'free').on && p1.at === 1000, 'switch off');
    ok(resolveRule('estimate_waiting', setRuleOn(p0, 'estimate_waiting', true, 5), 'free').on, 'switch on');
    const p2 = setRuleMode(p0, 'estimate_approved_invoice', 'draft', 2000);
    eq(p2.rules.estimate_approved_invoice, { mode: 'draft', since: 2000 }, 'choosing "do it for me" records the start time');
    ok(setRuleMode(p2, 'estimate_approved_invoice', 'draft', 9000) === p2, 'choosing it again changes nothing (the start time stays)');
    const p3 = setRuleMode(p2, 'estimate_approved_invoice', 'notify', 3000);
    eq(p3.rules.estimate_approved_invoice, { mode: 'notify' }, 'back to "just tell me" forgets the start time');
    ok(setRuleMode(p0, 'task_overdue', 'draft', 1) === p0, 'a mode the rule does not offer is ignored');
    eq(setRuleMode(p3, 'estimate_approved_invoice', 'draft', 4000).rules.estimate_approved_invoice?.since, 4000, 'switching on again later = a new start time');
    ok(setRuleDays(p0, 'estimate_waiting', 14, 10).rules.estimate_waiting?.days === 14 && setRuleDays(p0, 'estimate_waiting', 5, 10) === p0, 'days: only 3 / 7 / 14');
    ok(setRuleOn(setRuleOn(p0, 'task_overdue', false, 100), 'task_overdue', true, 50).at > 100, 'the change time always moves forward');

    // plan gating: "do it for me" is Premium; Free holds it back (and a downgrade does not lose the choice)
    ok(isPaid('premium') && isPaid('ai') && !isPaid('free') && !isPaid(null) && !isPaid(undefined) && !isPaid('trial'), 'paid tiers');
    const asked = setRuleMode(p0, 'job_completed_warranty', 'draft', 7000);
    eq([resolveRule('job_completed_warranty', asked, 'free').mode, resolveRule('job_completed_warranty', asked, 'free').chosenMode], ['notify', 'draft'], 'Free: only tells, the choice is kept');
    eq(resolveRule('job_completed_warranty', asked, 'premium').mode, 'draft', 'Premium: drafts');
    eq(resolveRule('job_completed_warranty', asked, 'ai').mode, 'draft', 'Premium + AI: drafts');
    eq(resolveRule('job_completed_warranty', asked, null).mode, 'notify', 'plan not known yet: only tells');
    eq(resolveRule('job_completed_warranty', parseAutomationPrefs({ rules: { job_completed_warranty: { mode: 'draft' } } }), 'premium').mode, 'notify', 'a "draft" choice without a start time never makes anything');
    eq(resolveRule('job_completed_warranty', asked, 'premium').since, 7000, 'the start time is what was saved');

    // two devices: the newest copy wins
    const older = setRuleOn(p0, 'task_overdue', false, 10);
    const newer = setRuleOn(p0, 'task_overdue', true, 20);
    eq(newerAutomationPrefs(older, newer), newer, 'newest copy wins');
    eq(newerAutomationPrefs(newer, older), newer, 'in either order');
    ok(sameAutomationPrefs(parseAutomationPrefs(JSON.parse(JSON.stringify(asked))), asked), 'prefs survive a JSON round trip (reload / sync)');
    ok(JSON.stringify(RULE_IDS.reduce((p, id) => setRuleOn(p, id, false, 1), p0)).length < 1500, 'prefs stay tiny');
    for (const k of [AUTOMATION_PREFS_SETTING, AUTOMATION_SEEN_SETTING, AUTOMATION_DONE_SETTING]) ok(/^[a-z0-9_.:-]{1,64}$/.test(k), `user_settings key allowed by the database check: ${k}`);
    eq([AUTOMATION_PREFS_SETTING, AUTOMATION_SEEN_SETTING, AUTOMATION_DONE_SETTING], ['automations.prefs', 'automations.seen', 'automations.done'], 'the three keys');
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. what the rules remember
// ---------------------------------------------------------------------------------------------------------------------
{
    const job = (id: string, status: string, createdAt = '2026-01-01T00:00:00Z') => ({ id, status, createdAt });
    // the first look: everything already completed is "before", nothing is an event
    const s1 = trackJobs(emptySeen(), [job('a', 'completed'), job('b', 'active'), job('c', 'completed')], NOW);
    ok(s1.since === Math.floor(NOW / 1000) && s1.base.length === 2 && Object.keys(s1.fresh).length === 0, 'first look: completed jobs become the base, no event');
    ok(freshCompletedAt(s1, 'a') === null && freshCompletedAt(s1, 'b') === null, 'no event for jobs already completed, or active');
    // a job turns completed later
    const s2 = trackJobs(s1, [job('a', 'completed'), job('b', 'completed'), job('c', 'completed')], NOW + 60_000);
    eq(freshCompletedAt(s2, 'b'), Math.floor((NOW + 60_000) / 1000), 'b turned completed: an event with its time');
    ok(freshCompletedAt(s2, 'a') === null, 'a stays "before"');
    ok(trackJobs(s2, [job('a', 'completed'), job('b', 'completed'), job('c', 'completed')], NOW + 120_000) === s2, 'nothing changed: the same object (no save)');
    ok(freshCompletedAt(trackJobs(s2, [job('a', 'completed'), job('b', 'completed'), job('c', 'completed')], NOW + 999_999), 'b') === freshCompletedAt(s2, 'b'), 'the event time is kept');
    // reopened and completed again = a new event
    const s3 = trackJobs(s2, [job('a', 'completed'), job('b', 'active'), job('c', 'completed')], NOW + 180_000);
    ok(freshCompletedAt(s3, 'b') === null, 'reopened: the event is forgotten');
    const s4 = trackJobs(s3, [job('a', 'completed'), job('b', 'completed'), job('c', 'completed')], NOW + 240_000);
    eq(freshCompletedAt(s4, 'b'), Math.floor((NOW + 240_000) / 1000), 'completed again: a new event');
    // a base job that is reopened and completed again is an event too
    const s5 = trackJobs(trackJobs(s1, [job('a', 'active'), job('c', 'completed')], NOW + 1000), [job('a', 'completed'), job('c', 'completed')], NOW + 2000);
    ok(freshCompletedAt(s5, 'a') !== null, 'a job that was completed before, reopened and completed again, is an event');
    // deleted jobs are forgotten
    ok(trackJobs(s2, [job('a', 'completed')], NOW + 5000).base.join() === s1.base.filter(k => k === autoKey('job', 'a')).join(), 'deleted jobs leave the lists');
    // bounds
    const many = Array.from({ length: SEEN_MAX_BASE + 300 }, (_, i) => job(`job-${i}`, 'completed', `2025-01-01T00:${String(i % 60).padStart(2, '0')}:00Z`));
    const big = trackJobs(emptySeen(), many, NOW);
    ok(big.base.length === SEEN_MAX_BASE, `base capped at ${SEEN_MAX_BASE}`);
    const crowded = { ...big, fresh: Object.fromEntries(Array.from({ length: SEEN_MAX_FRESH + 50 }, (_, i) => [`k${i}`, 1_700_000_000 + i])) };
    ok(Object.keys(parseSeen(JSON.parse(JSON.stringify(crowded))).fresh).length === SEEN_MAX_FRESH, `fresh capped at ${SEEN_MAX_FRESH}`);
    ok(JSON.stringify(parseSeen({ ...big, fresh: crowded.fresh })).length < STATE_MAX_CHARS, 'the seen list fits the 20,000 character limit with room');
    // two devices
    const a = { v: 1 as const, since: 500, base: ['x1', 'x2'], fresh: { f1: 100, f2: 300 } };
    const b = { v: 1 as const, since: 300, base: ['x2', 'x3'], fresh: { f2: 200, f3: 50 } };
    eq(mergeSeen(a, b), { v: 1, since: 300, base: ['x1', 'x2', 'x3'], fresh: { f1: 100, f2: 200, f3: 50 } }, 'merge: earliest start, union, earliest sighting');
    eq(mergeSeen(emptySeen(), b), b, 'merge with an empty copy keeps the other');
    eq(parseSeen('garbage'), emptySeen(), 'garbage -> empty');
    eq(parseSeen({ since: 'x', base: ['ok', 'NOT OK!', 5], fresh: { good: 10, bad: 'x', 'BAD KEY': 3 } }), { v: 1, since: 0, base: ['ok'], fresh: { good: 10 } }, 'odd entries dropped');

    // drafts made
    const entry = (i: number, ageDays = 1, kind: 'inv' | 'war' = 'inv'): DoneEntry => ({ r: kind, at: secAgo(ageDays), id: `doc-${i}`, jid: `job-${i}`, l: `Invoice INV-2026-11-${String(i).padStart(3, '0')}`, f: `Estimate EST-2026-11-${String(i).padStart(3, '0')}` });
    let log: DoneLog = emptyDone();
    for (let i = 0; i < DONE_MAX + 20; i++) log = recordDone(log, autoKey('inv', `e${i}`), entry(i, 1 + (i % 5)), NOW);
    ok(Object.keys(log.done).length === DONE_MAX, `drafts log capped at ${DONE_MAX}`);
    ok(JSON.stringify(log).length < STATE_MAX_CHARS, 'drafts log fits the limit');
    eq(Object.keys(pruneDone({ v: 1, done: { old: entry(1, DONE_KEEP_DAYS + 5), fresh: entry(2, 2) } }, NOW).done), ['fresh'], 'entries older than the keep time go');
    const longText: DoneLog = { v: 1, done: { k1: { ...entry(1), l: 'L'.repeat(500), f: 'F'.repeat(500) } } };
    ok(parseDone(longText).done.k1.l.length === 60 && parseDone(longText).done.k1.f.length === 60, 'long labels are cut');
    eq(parseDone({ done: { k1: { r: 'zzz', at: 5, id: 'x' }, k2: { r: 'inv', at: -1, id: 'x' }, k3: { r: 'war', at: secAgo(1), id: '' } } }), emptyDone(), 'bad entries dropped');
    const m = mergeDone({ v: 1, done: { k1: entry(1, 3) } }, { v: 1, done: { k1: entry(1, 2), k2: entry(2, 1) } }, NOW);
    ok(Object.keys(m.done).length === 2 && m.done.k1.at === secAgo(3), 'merge: union, the earlier record of the same draft');
    ok(parseDone(JSON.parse(JSON.stringify(log))).done[autoKey('inv', 'e0')] !== undefined, 'the log survives a JSON round trip');
}

// ---------------------------------------------------------------------------------------------------------------------
// 4. rule 1: estimate approved -> invoice
// ---------------------------------------------------------------------------------------------------------------------
const est = (id: string, o: Partial<EstimateRef> = {}): EstimateRef => ({ id, jobId: `job-${id}`, number: `EST-2026-11-00${id.length}`, clientName: 'Jane Smith', signedAt: ago(1), ...o });
const noDone = emptyDone();
const none = new Set<string>();
{
    const R = on('estimate_approved_invoice');
    const run = (estimates: EstimateRef[], over: Partial<Parameters<typeof evalEstimateApproved>[0]> = {}, rule = R) =>
        evalEstimateApproved({ estimates, invoiced: none, done: noDone, failed: none, ...over }, rule, ctx);

    const o = run([est('a'), est('bb')]);
    ok(o.items.length === 2 && o.actions.length === 0, 'notify mode: one note per approved estimate, no draft');
    ok(o.items.every(i => i.kind === 'auto_invoice_ready' && i.id.startsWith('auto:inv:') && i.target.kind === 'path'), 'kind, stable id, a target');
    ok(o.items.every(i => i.sourceRead === true), 'listed without a second unread count (the bell already says "signed")');
    eq(idsOf(run([est('a'), est('bb')]).items), idsOf(o.items), 'the same event gives the same ids every time (dedupe)');
    ok(/approved by Jane Smith/.test(o.items[0].text) && /Convert to invoice/.test(o.items[0].detail || ''), 'plain words');
    ok(o.items[0].target.kind === 'path' && (o.items[0].target as { path: string }).path.startsWith('/jobs/job-') && (o.items[0].target as { path: string }).path.includes('/forms/Estimate/'), 'opens the estimate');

    eq(run([est('a')], { invoiced: new Set(['a']) }).items, [], 'already invoiced: nothing');
    eq(run([est('a', { declinedAt: ago(0.5) })]).items, [], 'declined after it was signed: not an approval');
    eq(run([est('a', { declinedAt: ago(3) })]).items.length, 1, 'declined before it was signed: approved');
    eq(run([est('a', { signedAt: ago(EVENT_DAYS + 1) })]).items, [], `older than ${EVENT_DAYS} days: not news`);
    eq(run([est('a', { signedAt: null })]).items, [], 'never signed: nothing');
    eq(run([est('a')], {}, { ...R, on: false }), { items: [], actions: [] }, 'rule off: nothing');
    eq(run(Array.from({ length: 9 }, (_, i) => est(`e${i}`, { signedAt: ago(1 + i / 20) }))).items.length, MAX_PER_RULE, 'a flood is capped');

    // "do it for me": only Premium, only after the start time, only with a job, never twice
    const since = NOW - DAY * 2;
    const D = draftRule('estimate_approved_invoice', since);
    const d1 = run([est('a')], {}, D);
    eq(d1.actions, [{ type: 'create_invoice', key: autoKey('inv', 'a'), estimateId: 'a', jobId: 'job-a' }], 'draft mode: asks for the invoice draft');
    eq(d1.items, [], '... and says nothing yet (the note comes when the draft exists)');
    eq(run([est('a', { signedAt: ago(3) })], {}, D).actions, [], 'approved BEFORE "do it for me" was chosen: no draft');
    eq(run([est('a', { signedAt: ago(3) })], {}, D).items.length, 1, '... it just tells');
    eq(run([est('a', { jobId: null })], {}, D).actions, [], 'no job to file it under: no draft');
    eq(run([est('a', { jobId: null })], {}, D).items.length, 1, '... it just tells');
    eq(run([est('a')], { failed: new Set([autoKey('inv', 'a')]) }, D).actions, [], 'a draft that failed falls back to "tell me"');
    eq(run([est('a')], { failed: new Set([autoKey('inv', 'a')]) }, D).items.length, 1, '... with the note');
    const Free = resolveRule('estimate_approved_invoice', setRuleMode(defaultAutomationPrefs(), 'estimate_approved_invoice', 'draft', since), 'free');
    eq(run([est('a')], {}, Free).actions, [], 'Free plan: never a draft');
    eq(run([est('a')], {}, Free).items.length, 1, '... it tells');
    const Prem = resolveRule('estimate_approved_invoice', setRuleMode(defaultAutomationPrefs(), 'estimate_approved_invoice', 'draft', since), 'premium');
    eq(run([est('a')], {}, Prem).actions.length, 1, 'Premium through the real settings: a draft');
    // once made
    const made: DoneLog = { v: 1, done: { [autoKey('inv', 'a')]: { r: 'inv', at: secAgo(0.2), id: 'inv-doc', jid: 'job-a', l: 'Invoice INV-2026-11-004', f: 'Estimate EST-2026-11-001' } } };
    const d2 = run([est('a')], { done: made }, D);
    eq(d2.actions, [], 'made once: never asked again');
    ok(d2.items.length === 1 && d2.items[0].kind === 'auto_invoice_made' && /INV-2026-11-004 is ready as a draft/.test(d2.items[0].text) && /Review it before you send it/.test(d2.items[0].detail || ''), 'a note that the draft is ready');
    ok((d2.items[0].target as { path: string }).path === '/jobs/job-a/forms/Invoice/inv-doc', 'the note opens the new draft');
    ok(!d2.items[0].sourceRead, 'a document appeared: this one counts as unread');
    eq(run([est('a')], { done: made, invoiced: new Set(['a']) }, D).items.length, 1, 'invoiced + made: just the "ready" note');
    eq(evalEstimateApproved({ estimates: [], invoiced: none, done: made, failed: none }, D, ctx).items.length, 1, 'the "ready" note survives even when the estimate list is not read yet');
    eq(evalEstimateApproved({ estimates: [], invoiced: none, done: made, failed: none }, { ...D, on: false }, ctx).items, [], 'rule off: no notes at all');
}

// ---------------------------------------------------------------------------------------------------------------------
// 5. rule 2: job completed -> warranty
// ---------------------------------------------------------------------------------------------------------------------
{
    const job = (id: string, o: Partial<JobRef> = {}): JobRef => ({ id, name: `Kitchen ${id}`, status: 'completed', createdAt: '2026-09-01T00:00:00Z', ...o });
    const seenWith = (ids: Record<string, number>): SeenJobs => ({ v: 1, since: secAgo(30), base: ['zzz'], fresh: Object.fromEntries(Object.entries(ids).map(([id, s]) => [autoKey('job', id), s])) });
    const R = on('job_completed_warranty');
    const run = (jobs: JobRef[], seen: SeenJobs, over: Partial<Parameters<typeof evalJobCompleted>[0]> = {}, rule = R) =>
        evalJobCompleted({ jobs, seen, hasWarranty: none, done: noDone, failed: none, ...over }, rule, ctx);

    const o = run([job('a'), job('b')], seenWith({ a: secAgo(1) }));
    ok(o.items.length === 1 && o.items[0].kind === 'auto_warranty_ready' && o.items[0].id === `auto:war:a:${secAgo(1)}`, 'only a job seen turning completed');
    ok(/Kitchen a is completed/.test(o.items[0].text) && (o.items[0].target as { path: string }).path === '/jobs/a/forms/Warranty', 'plain words, opens a new warranty');
    eq(run([job('a')], seenWith({})).items, [], 'completed before the rules were watching: nothing');
    eq(run([job('a', { status: 'active' })], seenWith({ a: secAgo(1) })).items, [], 'no longer completed: nothing');
    eq(run([job('a')], seenWith({ a: secAgo(EVENT_DAYS + 2) })).items, [], 'seen long ago: nothing');
    eq(run([job('a')], seenWith({ a: secAgo(1) }), { hasWarranty: new Set(['a']) }).items, [], 'already has a warranty: nothing');
    eq(run([job('a', { createdAt: '2023-01-01T00:00:00Z' })], seenWith({ a: secAgo(1) })).items, [], 'a very old job is never "just completed"');
    eq(run([job('a')], seenWith({ a: secAgo(1) }), {}, { ...R, on: false }), { items: [], actions: [] }, 'rule off: nothing');
    const since = NOW - DAY * 3;
    const D = draftRule('job_completed_warranty', since);
    eq(run([job('a')], seenWith({ a: secAgo(1) }), {}, D).actions, [{ type: 'create_warranty', key: autoKey('war', 'a'), jobId: 'a', completedAtSec: secAgo(1) }], 'draft mode: asks for the warranty draft');
    eq(run([job('a')], seenWith({ a: secAgo(5) }), {}, D).actions, [], 'completed BEFORE "do it for me" was chosen: no draft');
    eq(run([job('a')], seenWith({ a: secAgo(5) }), {}, D).items.length, 1, '... it tells');
    eq(run([job('a')], seenWith({ a: secAgo(1) }), { failed: new Set([autoKey('war', 'a')]) }, D).actions, [], 'failed: falls back to "tell me"');
    const made: DoneLog = { v: 1, done: { [autoKey('war', 'a')]: { r: 'war', at: secAgo(0.1), id: 'war-doc', jid: 'a', l: 'Warranty WAR-2026-11-001', f: 'Kitchen a' } } };
    const d2 = run([job('a')], seenWith({ a: secAgo(1) }), { done: made }, D);
    ok(d2.actions.length === 0 && d2.items.length === 1 && d2.items[0].kind === 'auto_warranty_made' && (d2.items[0].target as { path: string }).path === '/jobs/a/forms/Warranty/war-doc', 'made once: a note that opens it, never asked again');
    eq(run([job('a')], seenWith({ a: secAgo(1) }), {}, resolveRule('job_completed_warranty', setRuleMode(defaultAutomationPrefs(), 'job_completed_warranty', 'draft', since), 'free')).actions, [], 'Free plan: never a draft');
}

// ---------------------------------------------------------------------------------------------------------------------
// 6. rule 3: task overdue
// ---------------------------------------------------------------------------------------------------------------------
{
    const R = on('task_overdue');
    const task = (id: string, o: Partial<TaskRef> = {}): TaskRef => ({ id, jobId: 'job-1', title: `Task ${id}`, status: 'todo', startDate: null, dueDate: '2026-11-13', dependsOn: [], isMilestone: false, sortOrder: 0, ...o });
    const names = new Map([['job-1', 'Smith kitchen']]);
    const o = evalTaskOverdue([task('a'), task('b', { dueDate: '2026-11-16' }), task('c', { dueDate: '2026-11-20' }), task('d', { status: 'done' }), task('e', { dueDate: null })], names, R, ctx);
    eq(idsOf(o.items), [`auto:task:a:${TODAY}`], 'only the one past its due date (not today, not later, not done, not undated)');
    ok(/“Task a” is 3 days late/.test(o.items[0].text) && o.items[0].detail === 'Smith kitchen', 'how late, and which job');
    ok((o.items[0].target as { path: string }).path === '/jobs/job-1#tasks', 'opens the job Tasks tab');
    eq(o.items[0].kind, 'auto_task_overdue', 'kind');
    // once per task per day
    eq(idsOf(evalTaskOverdue([task('a')], names, R, ctx).items), idsOf(o.items), 'same day, same id: it is told once');
    ok(evalTaskOverdue([task('a')], names, R, { now: NOW + DAY }).items[0].id === `auto:task:a:2026-11-17`, 'next day: a new note (once a day until done)');
    ok(evalTaskOverdue([task('a', { dueDate: '2026-11-15' })], names, R, ctx).items[0].text.includes('1 day late'), 'singular');
    ok(evalTaskOverdue([task('a', { startDate: '2026-11-10', dueDate: '2026-11-18' })], names, R, ctx).items.length === 0, 'a task still inside its days is not late');
    // flood: five named, then one line
    const lots = Array.from({ length: 9 }, (_, i) => task(`t${i}`, { dueDate: `2026-11-${String(5 + i).padStart(2, '0')}` }));
    const f = evalTaskOverdue(lots, names, R, ctx);
    ok(f.items.length === MAX_TASKS_NAMED + 1 && f.items[MAX_TASKS_NAMED].text === 'and 4 more overdue tasks', `at most ${MAX_TASKS_NAMED} named, then "and N more"`);
    ok(f.items[0].text.includes('11 days late'), 'the latest first');
    eq(evalTaskOverdue([task('a')], names, { ...R, on: false }, ctx), { items: [], actions: [] }, 'rule off: nothing');
    eq(evalTaskOverdue([], names, R, ctx).items, [], 'no tasks: nothing');
}

// ---------------------------------------------------------------------------------------------------------------------
// 7. rule 4: lead follow-up
// ---------------------------------------------------------------------------------------------------------------------
{
    const R = on('lead_followup');
    const lead = (id: string, followUpOn: string | null, o: Partial<LeadRef> = {}): LeadRef => ({ id, name: `Lead ${id}`, followUpOn, stage: 'contacted', archived: false, phone: '555-0100', ...o });
    const o = evalLeadFollowUp([lead('a', TODAY), lead('b', '2026-11-14'), lead('c', '2026-11-20'), lead('d', null), lead('e', TODAY, { stage: 'won' }), lead('f', TODAY, { stage: 'lost' }), lead('g', TODAY, { archived: true })], R, ctx);
    eq(idsOf(o.items), ['auto:lead:b:2026-11-14:late', 'auto:lead:a:2026-11-16:today'], 'today and missed ones only (not later, none, won, lost, archived), oldest first');
    ok(o.items[0].text === 'Follow-up with Lead b is 2 days late' && o.items[1].text === 'Follow up with Lead a today', 'plain words');
    ok(o.items[1].detail?.includes('555-0100') && (o.items[1].target as { path: string }).path === '/leads?lead=a', 'detail and opens the lead');
    ok(o.items.every(i => i.kind === 'auto_lead_followup'), 'kind');
    ok(evalLeadFollowUp([lead('a', TODAY)], R, { now: NOW + DAY }).items[0].id === 'auto:lead:a:2026-11-16:late', 'the next day it is told once more as late (a different note)');
    eq(evalLeadFollowUp([lead('a', TODAY)], R, { now: NOW + 2 * DAY }).items[0].id, 'auto:lead:a:2026-11-16:late', 'and not again after that (same id)');
    eq(evalLeadFollowUp([lead('a', ymd(NOW - (LEAD_LATE_DAYS + 1) * DAY))], R, ctx).items, [], `later than ${LEAD_LATE_DAYS} days: the Leads screen is the place`);
    ok(evalLeadFollowUp([lead('a', TODAY)], R, ctx).items[0].id !== evalLeadFollowUp([lead('a', '2026-11-15')], R, ctx).items[0].id, 'a new follow-up date = a new note');
    eq(evalLeadFollowUp(Array.from({ length: 12 }, (_, i) => lead(`l${i}`, TODAY)), R, ctx).items.length, MAX_PER_RULE, 'capped');
    eq(evalLeadFollowUp([lead('a', TODAY)], { ...R, on: false }, ctx), { items: [], actions: [] }, 'rule off: nothing');
}
function ymd(ms: number) { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// ---------------------------------------------------------------------------------------------------------------------
// 8. rule 5: client answers
// ---------------------------------------------------------------------------------------------------------------------
{
    const R = on('client_reply');
    const reply = (id: string, status: string, o: Partial<ReplyRef> = {}): ReplyRef => ({ id, jobId: 'job-1', kind: 'question', title: 'Which tile?', status, answeredAt: ago(1), answeredBy: 'Jane Smith', ...o });
    const names = new Map([['job-1', 'Smith kitchen']]);
    const o = evalClientReply([reply('a', 'answered'), reply('b', 'approved', { kind: 'submittal', title: 'Cabinet colours', answeredAt: ago(0.5) }), reply('c', 'rejected', { kind: 'submittal', answeredBy: null, answeredAt: ago(2) }),
        reply('d', 'sent'), reply('e', 'draft'), reply('f', 'closed'), reply('g', 'answered', { answeredAt: ago(EVENT_DAYS + 3) }), reply('h', 'answered', { answeredAt: null })], names, R, ctx);
    eq(o.items.map(i => i.text), ['Jane Smith approved the submittal “Cabinet colours”', 'Jane Smith answered the question “Which tile?”', 'Your client rejected the submittal “Which tile?”'], 'answered / approved / rejected, newest first (not sent, draft, closed, old, undated)');
    ok(o.items.every(i => i.kind === 'auto_client_reply' && i.detail === 'Smith kitchen' && (i.target as { path: string }).path === '/jobs/job-1#questions'), 'kind, job, opens the job questions');
    ok(idsOf(o.items).every(id => /^auto:reply:[a-z]:(answered|approved|rejected):/.test(id)), 'ids carry the status and the time');
    const first = evalClientReply([reply('a', 'answered')], names, R, ctx).items[0].id;
    eq(evalClientReply([reply('a', 'answered')], names, R, ctx).items[0].id, first, 'same answer, same id (told once)');
    ok(evalClientReply([reply('a', 'answered', { answeredAt: ago(0.2) })], names, R, ctx).items[0].id !== first, 'asked again and answered again: a new note');
    eq(evalClientReply([reply('a', 'answered')], names, { ...R, on: false }, ctx), { items: [], actions: [] }, 'rule off: nothing');
}

// ---------------------------------------------------------------------------------------------------------------------
// 9. rule 6: estimate waiting
// ---------------------------------------------------------------------------------------------------------------------
{
    const sent = (id: string, daysAgo: number, o: Partial<EstimateRef> = {}): EstimateRef => ({ id, jobId: 'job-1', number: 'EST-2026-11-001', clientName: 'Jane Smith', sentAt: ago(daysAgo), ...o });
    eq(resolveRule('estimate_waiting', defaultAutomationPrefs(), 'free').on, false, 'off by default');
    eq(evalEstimateWaiting([sent('a', 20)], resolveRule('estimate_waiting', defaultAutomationPrefs(), 'free'), ctx), { items: [], actions: [] }, 'off: nothing');
    const R7 = on('estimate_waiting', { days: 7 });
    const o = evalEstimateWaiting([sent('a', 8), sent('b', 6), sent('c', 7.2, { signedAt: ago(1) }), sent('d', 9, { declinedAt: ago(1) }), sent('e', 30, { sentAt: null })], R7, ctx);
    eq(idsOf(o.items), ['auto:wait:a:7'], 'after 7 days with no answer (not 6, not answered, not declined, not undated)');
    ok(/No answer yet: Estimate EST-2026-11-001 was sent 8 days ago/.test(o.items[0].text) && /Jane Smith/.test(o.items[0].detail || ''), 'plain words');
    eq(o.items[0].at, Date.parse(ago(8)) + 7 * DAY, 'listed at the moment it reached 7 days');
    eq(idsOf(evalEstimateWaiting([sent('a', 8)], R7, ctx).items), idsOf(o.items), 'same estimate, same id (told once)');
    eq(idsOf(evalEstimateWaiting([sent('a', 8)], on('estimate_waiting', { days: 3 }), ctx).items), ['auto:wait:a:3'], 'a different wait is a different note');
    eq(evalEstimateWaiting([sent('a', 3.5)], on('estimate_waiting', { days: 3 }), ctx).items.length, 1, '3 days');
    eq(evalEstimateWaiting([sent('a', 13)], on('estimate_waiting', { days: 14 }), ctx).items.length, 0, '14 days: not yet at 13');
    eq(evalEstimateWaiting([sent('a', 15)], on('estimate_waiting', { days: 14 }), ctx).items.length, 1, '14 days: at 15');
    eq(evalEstimateWaiting(Array.from({ length: 10 }, (_, i) => sent(`s${i}`, 10 + i)), R7, ctx).items.length, MAX_PER_RULE, 'capped');
    ok(o.items[0].kind === 'auto_estimate_waiting', 'kind');
}

// ---------------------------------------------------------------------------------------------------------------------
// 10. the bell: one category, read / removed state keeps a note gone
// ---------------------------------------------------------------------------------------------------------------------
{
    const autoKinds = (Object.keys(KIND_META) as NotificationKind[]).filter(k => k.startsWith('auto_'));
    eq(autoKinds.length, 8, 'eight automation kinds');
    ok(autoKinds.every(k => KIND_META[k].category === 'automations'), 'all in one category');
    ok(NOTIFICATION_CATEGORIES.some(c => c.id === 'automations' && /Settings > Automations/.test(c.hint)), 'Settings > Notifications lists it');
    const R = on('task_overdue');
    const mk = (id: string): TaskRef => ({ id, jobId: 'j', title: `T${id}`, status: 'todo', startDate: null, dueDate: '2026-11-13', dependsOn: [], isMilestone: false, sortOrder: 0 });
    const items = evalTaskOverdue([mk('a'), mk('b')], new Map(), R, ctx).items;
    const build = (state = emptyState(), prefs = defaultPrefs()) => buildNotifications({ now: NOW, items, state, prefs, seen: {} });
    const b1 = build();
    ok(b1.list.length === 2 && b1.unread === 2 && b1.list.every(n => n.category === 'automations'), 'shown and unread');
    // read once: stays read when the rule is evaluated again (the next refresh builds the same ids)
    const read = markRead(emptyState(), [items[0].id], NOW);
    ok(build(read).unread === 1, 'read stays read');
    const gone = dismiss(emptyState(), [items[0].id], NOW);
    eq(build(gone).list.map(n => n.id), [items[1].id], 'removed stays removed (never nagged twice)');
    // the same note twice in one evaluation is one note
    ok(buildNotifications({ now: NOW, items: [...items, ...items], state: emptyState(), prefs: defaultPrefs(), seen: {} }).list.length === 2, 'duplicates collapse');
    // the category switch
    eq(build(emptyState(), setCategory(defaultPrefs(), 'automations', false, 1)).list, [], 'Notifications > Automation rules off: none shown');
    // the next day is a new note
    const tomorrow = evalTaskOverdue([mk('a')], new Map(), R, { now: NOW + DAY }).items;
    ok(buildNotifications({ now: NOW + DAY, items: tomorrow, state: gone, prefs: defaultPrefs(), seen: {} }).list.length === 1, 'removed today, told again tomorrow (once a day)');
    ok(notificationKey(items[0].id).length > 0, 'stable key');
}

// ---------------------------------------------------------------------------------------------------------------------
// 11. the two drafts
// ---------------------------------------------------------------------------------------------------------------------
{
    const estimateData = {
        title: 'Kitchen remodel', estimateNumber: 'EST-2026-11-002', clientId: 'cl-1', clientName: 'Jane Smith', clientAddress: '12 Oak St',
        companyName: 'Acme Builders', companyAddress: '1 Main', logoUrl: 'logo.png', templateId: 'classic_trade', themeColors: { primary: '#123456', secondary: '#666666' },
        lineItems: [{ id: 'l1', description: 'Cabinets', quantity: 2, rate: 500, unitCost: 300 }, { id: 'l2', description: 'Labor', quantity: 10, rate: 60 }],
        taxRate: 7, discount: 25, status: 'Accepted', clientSignedAt: ago(1), clientSignatureUrl: 'data:image/png;base64,xxx', notes: 'Estimate notes', terms: 'Estimate terms',
    };
    const d = buildInvoiceDraft({
        estimateId: 'est-1', estimateData, job: { id: 'job-1', clientName: 'Jane Smith', clientAddress: '12 Oak St' },
        profile: { companyName: 'Acme Builders', payLinkDefault: 'https://paypal.me/acme', payLinkLabel: 'PayPal' }, today: TODAY,
        taken: ['INV-2026-11-001', 'INV-2026-11-003', null, ''], now: new Date(NOW),
    });
    eq(d.formType, 'Invoice', 'an invoice');
    ok(d.data.status === 'Draft', 'always a Draft');
    eq(d.number, 'INV-2026-11-004', 'the next number of the series, unique against the taken ones');
    ok(d.data.invoiceNumber === d.number && d.label === 'Invoice INV-2026-11-004', 'number and label');
    ok(d.data.sourceEstimateId === 'est-1' && d.data.sourceEstimateNumber === 'EST-2026-11-002', 'linked back to the estimate (what "already invoiced" looks for)');
    eq((d.data.lineItems as Array<{ description: string; unitCost?: number }>).map(l => [l.description, l.unitCost]), [['Cabinets', 300], ['Labor', undefined]], 'the lines (internal costs kept)');
    ok(d.data.taxRate === 7 && d.data.discount === 25 && d.data.clientName === 'Jane Smith' && d.data.clientId === 'cl-1' && d.data.templateId === 'classic_trade', 'tax, discount, client and design carried over');
    ok(d.data.issueDate === TODAY && d.data.dueDate === '2026-12-16', 'issued today, due in 30 days');
    ok(d.data.paypalLink === 'https://paypal.me/acme' && d.data.payLinkLabel === 'PayPal', 'the pay link of Settings');
    ok(d.data.companyName === 'Acme Builders', 'company details');
    ok(!('clientSignatureUrl' in d.data) && !('clientSignedAt' in d.data), 'no client signature on the invoice');
    ok(d.data.notes === 'Thank you for your business.' && d.data.isProgressBilling === false && d.data.amountPaid === undefined, 'the invoice form defaults, no payment recorded');
    ok(buildInvoiceDraft({ estimateId: 'e', estimateData: {}, job: { id: 'j' }, today: TODAY, taken: [], now: new Date(NOW) }).data.status === 'Draft', 'an empty estimate still gives a Draft');

    const w = buildWarrantyDraft({ job: { id: 'job-1', name: 'Kitchen', clientName: 'Jane Smith', clientAddress: '12 Oak St' }, profile: { logoUrl: 'logo.png' }, today: TODAY, taken: ['WAR-2026-11-001'], now: new Date(NOW) });
    eq(w.formType, 'Warranty', 'a warranty');
    eq(w.number, 'WAR-2026-11-002', 'next warranty number');
    ok(w.data.clientName === 'Jane Smith' && w.data.projectAddress === '12 Oak St' && w.data.completedDate === TODAY && w.data.duration === '1 Year', 'client, address, completed today, 1 year');
    ok(String(w.data.coverage).length > 40 && String(w.data.conditions).length > 40, 'standard coverage and conditions');
    ok(w.data.signatureUrl === '' && !('clientSignedAt' in w.data), 'not signed');
}

// ---------------------------------------------------------------------------------------------------------------------
// 12. the existing behaviours: bound to their own settings, defaults unchanged
// ---------------------------------------------------------------------------------------------------------------------
{
    const ids = BOUND_ROWS.map(r => r.id);
    ok(new Set(ids).size === ids.length, 'bound row ids unique');
    const bell = BOUND_ROWS.filter(r => r.binding.type === 'bell').map(r => (r.binding as { category: string }).category);
    ok(new Set(bell).size === bell.length, 'every bell type is on one row only');
    ok(bell.every(c => NOTIFICATION_CATEGORIES.some(n => n.id === c)), 'every bell row is a real notification type');
    // the hard-wired automations of the app, as the owner listed them
    for (const c of ['overdue', 'expiring', 'clients', 'payments', 'stock', 'orders', 'papers', 'service', 'crew', 'requests']) ok(bell.includes(c), `bell type listed: ${c}`);
    eq(BOUND_ROWS.filter(r => r.binding.type === 'reminder').map(r => (r.binding as { kind: string }).kind).sort(), ['estimate', 'invoice', 'visit'], 'the three reminder emails');
    // defaults are the existing ones: nothing is switched on or off by listing them
    ok(defaultPrefs().off.length === 0, 'every bell type is on by default, as before');
    ok(DEFAULT_REMINDER_SETTINGS.enabled && DEFAULT_REMINDER_SETTINGS.invoice.enabled && DEFAULT_REMINDER_SETTINGS.estimate.enabled && !DEFAULT_REMINDER_SETTINGS.visit.enabled, 'reminder defaults unchanged: invoices + estimates on, visits off');
    ok(ALWAYS_ON.some(a => /purchase order/i.test(a.text) && /stock/i.test(a.text)), 'PO received -> stock listed as always on');
    ok(ALWAYS_ON.every(a => !('binding' in a)), 'always-on items have no switch');
    for (const g of GROUPS) ok(BOUND_ROWS.some(r => r.group === g.id) || ALWAYS_ON.some(a => a.group === g.id) || RULES.some(r => r.group === g.id), `group ${g.label} has rows`);
}

// ---------------------------------------------------------------------------------------------------------------------
// 13. wiring
// ---------------------------------------------------------------------------------------------------------------------
{
    const settings = read('components/Settings.tsx');
    const sections = settings.slice(settings.indexOf('const SECTIONS'), settings.indexOf('const editableKeys'));
    ok(/'automations' \| 'reminders'/.test(settings) && sections.includes("{ id: 'automations', label: 'Automations' }"), 'Settings: the Automations section is in the list');
    ok(sections.indexOf("'automations'") < sections.indexOf("'reminders'") && sections.indexOf("'billing'") < sections.indexOf("'automations'"), 'Settings: between Plan & billing and Reminders');
    ok(settings.includes('<AutomationsSettings plan={plan} onUpgradeClick={onUpgradeClick} />') && settings.indexOf('<AutomationsSettings') < settings.indexOf('<ReminderSettingsCard'), 'Settings: rendered before the Reminders card');
    ok(settings.includes('<ReminderSettingsCard') && settings.includes('<NotificationSettingsCard') && settings.includes('<DocumentDesignSettings'), 'Settings: the old cards are all still there');

    const ui = read('components/automations/AutomationsSettings.tsx');
    ok(ui.includes('id="settings-automations"') && ui.includes('role="radiogroup"') && ui.includes('PremiumTag') && ui.includes('onUpgradeClick'), 'UI: anchor, choice, Premium tag, upgrade prompt');
    ok(ui.includes('notificationStore.setPrefs(setCategory(') && ui.includes('saveReminderSettings(next)'), 'UI: bound rows write the existing settings');
    ok(ui.includes("[kind]: { ...base[kind], enabled: on }") && ui.includes('timezone: browserTimezone()'), 'UI: reminder switch changes one flag and keeps the rest (same first-save rule as the Reminders card)');
    ok(!/emerald|bg-gradient|rounded-2xl bg-primary\/10/.test(ui), 'UI: no tinted-icon-square grid');
    ok(ui.includes('ruleAvailable(r, tools)'), 'UI: rules of tools that are not ready are not listed');

    const center = read('components/notifications/NotificationCenter.tsx');
    ok(center.includes('useAutomationNotifications(') && center.includes('...autoItems,') && /autoItems, outboxItems/.test(center), 'bell engine: the rules join the list');
    const app = read('App.tsx');
    ok(app.includes('profile={profile}') && app.includes('jobsReady={jobsLoaded && !usingCachedData}'), 'App: two props only on the existing notification engine');
    ok((app.match(/automations/gi) || []).length === 0, 'App: no other automation code');

    const actions = read('lib/automations/actions.ts');
    ok(!/\.update\(|\.delete\(|\.rpc\(|functions\.invoke|sendEmail|gmail/i.test(actions), 'actions: never edits, deletes, sends or calls a function');
    ok(/upsertDocumentRecord/.test(actions) && !/status: '(Sent|Paid|Accepted|Approved)'|clientSignedAt:|amountPaid/.test(actions), 'actions: one insert, no sent / paid / signed status');
    ok(/fetchInvoicesFromEstimate/.test(actions) && /eq\('type', 'Warranty'\)/.test(actions), 'actions: re-check the database right before inserting');
    const drafts = read('lib/automations/drafts.ts');
    ok((drafts.match(/'Draft'/g) || []).length >= 2, 'drafts: status Draft');
    ok(!/emailMessage|mailto|\.sentAt|clientSignedAt:/.test(drafts), 'drafts: nothing sent or signed');
    const evaluate = read('lib/automations/evaluate.ts');
    ok(!/supabase|fetch\(|window\.|document\./.test(evaluate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'evaluate: pure (no network, no browser)');
    const hook = read('components/automations/useAutomations.ts');
    ok(hook.includes('ruleAvailable(ruleDef(id), tools)') && hook.includes('useTasksFeature') && hook.includes('useLeadsFeature') && hook.includes('useQuestionsFeature'), 'engine: silent until the tool is ready');
    ok(hook.includes('snap.synced') && hook.includes('jobsReady'), 'engine: follows jobs only once the account copy and the whole list are in');
    ok(hook.includes('busy.current') && hook.includes('tried.current'), 'engine: one draft at a time, each tried once per session');
    ok(read('lib/userData.ts').includes("'automations.prefs'") && read('lib/userData.ts').includes("'automations.done'"), 'userData.ts lists the new account settings');
    ok(!/supabase\/(migrations|functions)/.test(settings), 'no database files in the settings wiring');

    // help: the guide exists and every [[label]] is on screen
    const g = getGuide('automations');
    ok(!!g && g.appPath === '/settings#automations' && g.steps.length >= 5 && HELP_GUIDES.filter(x => x.id === 'automations').length === 1, 'help guide listed once, opens the section');
    const src = [ui, read('lib/automations/rules.ts'), read('components/Settings.tsx')].join('\n');
    const labels = (JSON.stringify(g).match(/\[\[([^\]]+)\]\]/g) || []).map(l => l.slice(2, -2));
    const missing = labels.filter(l => !src.includes(`'${l}'`) && !src.includes(`"${l}"`) && !src.includes(`>${l}<`) && !src.includes(`>${l}`) && !src.includes(`${l}{`) && !src.includes(`: '${l}`) && !src.includes(`title: '${l}'`));
    eq(missing, [], 'every [[label]] of the guide is on screen');
    ok(labels.length >= 6, 'the guide uses chips');
    ok(!/kelviq|merchant of record/i.test(JSON.stringify(g) + ui), 'no forbidden words');
    ok(/Automations/.test(JSON.stringify(getGuide('notifications'))), 'the bell guide mentions the rules');
    ok(read('components/help/HelpButton.tsx').includes("automations: ['notifications', 'reminders', 'settings']"), 'help: related guides');
}

console.log(`automations-check: ${checks} checks passed`);
