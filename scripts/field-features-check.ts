/**
 * Field features: punch lists (#18), the papers vault + lien waivers (#17) and recurring service plans (#15).
 * Pure logic, the offline outbox in memory, and a lint of the three additive migrations. No database needed:
 *   npx tsx scripts/field-features-check.ts
 *
 * Covers: punch list state rules + progress + quick add + portal payload + the PDF section; punch items saved offline
 * (queue, sync order after their job, id remap, overlay); expiry states and the 30/7/1-day reminder schedule; lien
 * waiver prefill from job / invoice / payment and its text; service plan next-visit math (month ends, leap years,
 * weeks), visit generation windows, per-visit invoices and recurring-invoice mapping; the migrations (RLS, SECURITY
 * DEFINER + search_path, grants, no destructive statement).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    applyPunchStatus, buildPunchListHtml, canTransition, filterPunchItems, groupByArea, knownAreas, mapPunchRow, nextPosition,
    parsePortalPunch, parseQuickAdd, portalActionsFor, progressByJob, progressLabel, punchProgress, punchRowOf, sortPunchItems, toggleTarget,
    type PunchItem,
} from '../lib/punchList.ts';
import { applyEntityOverlay, orderForSync, remapItem, ENTITY_TYPE, type OutboxItem } from '../lib/offline/outboxModel.ts';
import { createMemoryOutboxStore } from '../lib/offline/outboxStore.ts';
import { queueOfflineSave } from '../lib/offline/outboxActions.ts';
import { runOutboxSync, type SyncDeps } from '../lib/offline/syncEngine.ts';
import { derivePaperNotifications, derivePunchNotifications } from '../lib/notifications/model.ts';
import {
    blankPaper, expiryPhrase, expiryState, mapPaperRow, nextPaperStep, normalizePaperOffsets, paperFilePath, paperFileProblem, paperProblems,
    paperRowOf, papersSummary, sendPaperEmail, sortPapers,
} from '../lib/papers.ts';
import { duePaperStep, paperDedupeKey, paperReminderEmail, paperReminderSteps } from '../supabase/functions/reminders/shared/papers.ts';
import { buildLienWaiverHtml, lienWaiverTitle, waiverCheck, waiverInvoices, waiverPrefill } from '../lib/lienWaiver.ts';
import {
    annualValue, dueVisits, frequencyLabel, mapPlanRow, mapVisitRow, nextVisitDate, parsePortalPlans, planProblems, planRowOf, priceLabel,
    recurrenceFrequency, recurringInvoiceFields, upcomingVisitDates, visitInvoicePreview, type PlanBilling, type ServicePlan,
} from '../lib/servicePlans.ts';
import { planRecurringCatchUp } from '../lib/recurring.ts';
import { deriveServiceVisitNotifications } from '../lib/notifications/model.ts';
import { NAV_LABELS, NAV_ROUTES, retrieveKnowledge } from '../supabase/functions/ai-assistant/shared/knowledge.ts';
import { HELP_GUIDES } from '../components/help/helpContent.ts';
import { parseView } from '../lib/routes.ts';

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
const throws = (label: string, fn: () => unknown) => {
    try { fn(); failures++; console.error(`FAIL ${label}: did not throw`); } catch { passes++; }
};

const here = dirname(fileURLToPath(import.meta.url));
const readMigration = (f: string) => readFileSync(join(here, '..', 'supabase', 'migrations', f), 'utf8');
const NOW = '2026-11-15T10:00:00.000Z';
const TODAY = '2026-11-15';

// =====================================================================================================================
// 1. Punch lists
// =====================================================================================================================
const item = (over: Partial<PunchItem> = {}): PunchItem => ({
    id: 'p1', jobId: 'job-1', title: 'Touch up paint', area: 'Kitchen', assignee: '', dueOn: '', status: 'open', position: 10, notes: '',
    beforePhotoId: null, afterPhotoId: null, doneAt: null, verifiedAt: null, verifiedBy: null, clientNote: '', clientNoteAt: null,
    createdAt: '2026-11-10T08:00:00.000Z', updatedAt: '2026-11-10T08:00:00.000Z', ...over,
});

{
    // state rules
    const open = item();
    const done = item({ status: 'done', doneAt: NOW });
    const verifiedC = item({ status: 'verified', verifiedBy: 'client', doneAt: NOW, verifiedAt: NOW });
    const verifiedK = item({ status: 'verified', verifiedBy: 'contractor', doneAt: NOW, verifiedAt: NOW });
    eq('contractor: open → done', canTransition(open, 'done', 'contractor'), true);
    eq('contractor: open → verified is not allowed (done first)', canTransition(open, 'verified', 'contractor'), false);
    eq('contractor: done → open / verified', [canTransition(done, 'open', 'contractor'), canTransition(done, 'verified', 'contractor')], [true, true]);
    eq('contractor: verified → open / done', [canTransition(verifiedK, 'open', 'contractor'), canTransition(verifiedK, 'done', 'contractor')], [true, true]);
    eq('same status is not a move', canTransition(done, 'done', 'contractor'), false);
    eq('client: only done items', [canTransition(open, 'verified', 'client'), canTransition(open, 'done', 'client'), canTransition(done, 'verified', 'client'), canTransition(done, 'open', 'client')], [false, false, true, true]);
    eq('client: changes their mind only on what THEY verified', [canTransition(verifiedC, 'open', 'client'), canTransition(verifiedK, 'open', 'client'), canTransition(verifiedC, 'done', 'client')], [true, false, false]);

    const d = applyPunchStatus(open, 'done', 'contractor', NOW);
    eq('done: done_at set, no verification', [d.status, d.doneAt, d.verifiedAt, d.verifiedBy], ['done', NOW, null, null]);
    const v = applyPunchStatus(d, 'verified', 'client', '2026-11-16T09:00:00.000Z');
    eq('client verified: keeps done_at, records who', [v.status, v.doneAt, v.verifiedAt, v.verifiedBy], ['verified', NOW, '2026-11-16T09:00:00.000Z', 'client']);
    const back = applyPunchStatus(d, 'open', 'client', NOW, '  Paint still streaky by the window  ');
    eq('client needs work: open again with the trimmed note', [back.status, back.doneAt, back.clientNote, back.clientNoteAt], ['open', null, 'Paint still streaky by the window', NOW]);
    throws('client needs work needs a note', () => applyPunchStatus(d, 'open', 'client', NOW, '   '));
    throws('client cannot verify an open item', () => applyPunchStatus(open, 'verified', 'client', NOW));
    const un = applyPunchStatus(verifiedK, 'done', 'contractor', '2026-11-17T00:00:00.000Z');
    eq('unverify keeps the original done time', [un.status, un.doneAt, un.verifiedBy], ['done', NOW, null]);
    eq('ring: open → done, done → open, verified → menu', [toggleTarget(open), toggleTarget(done), toggleTarget(verifiedK)], ['done', 'open', null]);
    eq('portal buttons', [portalActionsFor(open), portalActionsFor(done), portalActionsFor(verifiedC), portalActionsFor(verifiedK)],
        [{ looksGood: false, needsWork: false }, { looksGood: true, needsWork: true }, { looksGood: false, needsWork: true }, { looksGood: false, needsWork: false }]);
}
{
    // progress, sort, group
    const list = [
        item({ id: 'a', status: 'open', dueOn: '2026-11-14', area: 'Kitchen' }),
        item({ id: 'b', status: 'done', area: 'Bath 2' }),
        item({ id: 'c', status: 'verified', verifiedBy: 'client', area: 'Kitchen' }),
        item({ id: 'd', status: 'open', area: '', clientNote: 'Still loose', position: 50 }),
        item({ id: 'e', status: 'open', dueOn: '2026-11-20', area: 'Kitchen', position: 5 }),
    ];
    const p = punchProgress(list, TODAY);
    eq('progress counts', [p.total, p.open, p.done, p.verified, p.closed, p.pct, p.overdue, p.sentBack], [5, 3, 1, 1, 2, 40, 1, 1]);
    eq('progress labels', [progressLabel(p), progressLabel(punchProgress([], TODAY)), progressLabel(punchProgress([item({ status: 'done' }), item({ status: 'verified' })])), progressLabel(punchProgress([item({ status: 'verified' })]))],
        ['2 of 5 done', 'No items', 'All 2 done', 'All 1 verified']);
    eq('sort: sent back, overdue, by due date, then done, verified', sortPunchItems(list, TODAY).map(i => i.id), ['d', 'a', 'e', 'b', 'c']);
    eq('filter', [filterPunchItems(list, 'open').length, filterPunchItems(list, 'done').map(i => i.id), filterPunchItems(list, 'all').length], [3, ['b'], 5]);
    eq('group by area, General last', groupByArea(sortPunchItems(list, TODAY)).map(g => [g.area, g.items.map(i => i.id)]), [['Kitchen', ['a', 'e', 'c']], ['Bath 2', ['b']], ['General', ['d']]]);
    eq('known areas: most used first', knownAreas(list), ['Kitchen', 'Bath 2']);
    eq('next position after the last', nextPosition(list), 60);
    const byJob = progressByJob([{ job_id: 'j1', status: 'done' }, { job_id: 'j1', status: 'open', due_on: '2026-11-01' }, { job_id: 'j2', status: 'verified' }, { job_id: null, status: 'open' }], TODAY);
    eq('progress per job (pipeline)', [byJob.size, byJob.get('j1')?.closed, byJob.get('j1')?.overdue, byJob.get('j2')?.pct], [2, 1, 1, 100]);
}
{
    // quick add
    eq('area + title + assignee', parseQuickAdd('Kitchen: touch up paint @Mike'), { title: 'touch up paint', area: 'Kitchen', assignee: 'Mike' });
    eq('sticky area', parseQuickAdd('caulk tub', 'Bath 2'), { title: 'caulk tub', area: 'Bath 2', assignee: '' });
    eq('a new area replaces the sticky one', parseQuickAdd('Garage: hang door', 'Bath 2')?.area, 'Garage');
    eq('times are not areas', parseQuickAdd('10:30 meet inspector'), { title: '10:30 meet inspector', area: '', assignee: '' });
    eq('two-word assignee', parseQuickAdd('replace outlet cover @Ana Lopez')?.assignee, 'Ana Lopez');
    eq('an email is not an assignee', parseQuickAdd('send photos to bob@x.com')?.assignee, '');
    eq('empty', [parseQuickAdd('   '), parseQuickAdd('Kitchen:   ')], [null, null]);
    eq('long titles are cut to 300', parseQuickAdd('x'.repeat(400))?.title.length, 300);
}
{
    // rows
    const row = punchRowOf(item({ title: '  Fix  ', area: '  ', assignee: ' Sam ', dueOn: '2026-11-20' }), 'u1');
    eq('row for the table', [row.user_id, row.job_id, row.title, row.area, row.assignee, row.due_on, row.status], ['u1', 'job-1', 'Fix', null, 'Sam', '2026-11-20', 'open']);
    const back = mapPunchRow({ id: 'x', job_id: 'j', title: 'T', status: 'weird', due_on: '2026-11-20T00:00:00Z', verified_by: 'hacker', position: 'abc' });
    eq('odd rows are safe', [back.status, back.dueOn, back.verifiedBy, back.position], ['open', '2026-11-20', null, 0]);
}
{
    // portal payload
    const jobs = parsePortalPunch([
        { job_id: 'j1', job_name: 'Kitchen remodel', items: [
            { id: 'i1', title: 'Paint', area: 'Kitchen', status: 'done', before_path: 'u/abc.jpg', after_path: '' },
            { id: 'i2', title: 'Caulk', status: 'verified', verified_by: 'client', client_note: 'ok' },
            { id: '', title: 'no id' }, null,
        ] },
        { job_id: 'j2', job_name: '', items: [] },
        'junk',
    ]);
    eq('portal: jobs with items only, bad rows dropped', [jobs.length, jobs[0].items.length, jobs[0].jobName], [1, 2, 'Kitchen remodel']);
    eq('portal: photos only with a path', [jobs[0].items[0].beforePath, jobs[0].items[0].afterPath], ['u/abc.jpg', null]);
    eq('portal: progress', [jobs[0].progress.closed, jobs[0].progress.total], [2, 2]);
    eq('portal: not an array → []', parsePortalPunch({ error: 'x' }), []);
}
{
    // PDF section (Note document)
    const html = buildPunchListHtml({
        items: [item({ title: '<script>alert(1)</script>', notes: 'a & b', clientNote: '"quoted"' }), item({ id: 'p2', status: 'verified', verifiedBy: 'client', area: '' })],
        photos: { p1: { before: 'data:image/jpeg;base64,AAAA', after: 'javascript:alert(1)' } },
        today: TODAY,
    });
    ok('pdf: text is escaped', !html.includes('<script>') && html.includes('&lt;script&gt;') && html.includes('a &amp; b') && html.includes('&quot;quoted&quot;'));
    ok('pdf: data image kept, javascript: source dropped', html.includes('data:image/jpeg;base64,AAAA') && !html.includes('javascript:'));
    ok('pdf: verified by client is said', html.includes('Verified by client'));
    ok('pdf: progress line', html.includes('1 of 2 done'));
    ok('pdf: areas as headings, General last', html.indexOf('<h3>Kitchen</h3>') < html.indexOf('<h3>General</h3>'));
    eq('pdf: empty list', buildPunchListHtml({ items: [] }).includes('No items'), true);
}
{
    // notifications
    const n = derivePunchNotifications([
        { id: 'a', jobId: 'j1', title: 'Paint', status: 'verified', verifiedBy: 'client', verifiedAt: NOW },
        { id: 'b', jobId: 'j1', title: 'Caulk', status: 'open', clientNote: 'gap by the faucet', clientNoteAt: NOW },
        { id: 'c', jobId: 'j1', title: 'Trim', status: 'verified', verifiedBy: 'contractor', verifiedAt: NOW },
        { id: 'd', jobId: 'j1', title: 'Old note, fixed', status: 'done', clientNote: 'x', clientNoteAt: NOW },
    ], new Map([['j1', 'Kitchen remodel']]));
    eq('bell: client approvals and send-backs only', n.map(x => [x.kind, x.target.kind === 'path' ? x.target.path : '']), [['punch_ok', '/jobs/j1#punch'], ['punch_needs_work', '/jobs/j1#punch']]);
}

async function offlinePunch() {
    // punch items saved offline: queued per item, merged edits, synced after their (offline) job with the id remapped
    const U = 'user-a';
    const store = createMemoryOutboxStore();
    const at = (n: number) => new Date(Date.parse(NOW) + n * 1000);
    await queueOfflineSave(store, { entity: 'job', userId: U, docId: 'job-off', jobId: 'job-off', type: 'Job', kind: 'create', data: { id: 'job-off', user_id: U, name: 'Porch' } }, at(1));
    const row = punchRowOf(item({ id: 'pi-1', jobId: 'job-off' }), U);
    await queueOfflineSave(store, { entity: 'punch_item', userId: U, docId: 'pi-1', jobId: 'job-off', type: ENTITY_TYPE.punch_item, kind: 'create', data: row }, at(2));
    await queueOfflineSave(store, { entity: 'punch_item', userId: U, docId: 'pi-1', jobId: 'job-off', type: ENTITY_TYPE.punch_item, kind: 'edit', data: { id: 'pi-1', job_id: 'job-off', title: 'Touch up paint', status: 'done', done_at: NOW } }, at(3));
    await queueOfflineSave(store, { entity: 'punch_item', userId: U, docId: 'pi-2', jobId: 'job-1', type: ENTITY_TYPE.punch_item, kind: 'edit', data: { id: 'pi-2', job_id: 'job-1', title: 'Hang door', status: 'done' } }, at(4));
    const items = await store.getItems(U);
    eq('offline: one item per punch item, a created item stays a create with the edit merged', items.filter(i => i.docId === 'pi-1').map(i => [i.kind, i.data.status, i.data.title]), [['create', 'done', 'Touch up paint']]);
    eq('offline: sync order job → punch items', orderForSync(items).map(i => i.docId), ['job-off', 'pi-1', 'pi-2']);
    eq('offline: display type', ENTITY_TYPE.punch_item, 'Punch item');

    // the screen shows the waiting versions on top of the account's list
    const serverList = [item({ id: 'pi-2', jobId: 'job-1', title: 'Hang door' })];
    const shown = applyEntityOverlay(serverList, items, U, 'punch_item', (r, prev) => mapPunchRow({ ...(prev ? punchRowOf(prev, U) : {}), created_at: prev?.createdAt, ...r }));
    eq('overlay: created offline item added, edited one changed', shown.map(i => [i.id, i.status]), [['pi-1', 'done'], ['pi-2', 'done']]);
    eq('overlay: another user sees nothing of it', applyEntityOverlay(serverList, items, 'user-b', 'punch_item', (r) => mapPunchRow(r)), serverList);

    const calls: string[] = [];
    const saveEntity: SyncDeps['saveEntity'] = async (entity, kind, r) => {
        calls.push(`${entity}:${kind}:${r.id}:${r.job_id ?? ''}`);
        return entity === 'job' ? { id: 'job-real', error: null } : { error: null };
    };
    const deps: SyncDeps = {
        store, userId: U, saveEntity,
        upsert: async () => ({ row: null, error: null }),
        fetchServer: async () => null,
        fetchNumbers: async () => [],
        uploadPhoto: async () => 'https://x/y.jpg',
        now: () => at(10),
    };
    const rep = await runOutboxSync(deps);
    eq('sync: job first, punch item lands in the job the account gave, then the edit', calls, ['job:create:job-off:', 'punch_item:create:pi-1:job-real', 'punch_item:edit:pi-2:job-1']);
    eq('sync: outbox empty, synced punch item keeps its job', [rep.remaining, rep.synced.find(s => s.docId === 'pi-1')?.jobId], [0, 'job-real']);

    // a refused punch item (e.g. 500-item cap) stays with its reason, the rest goes on
    const store2 = createMemoryOutboxStore();
    await queueOfflineSave(store2, { entity: 'punch_item', userId: U, docId: 'pi-x', jobId: 'job-1', type: 'Punch item', kind: 'create', data: punchRowOf(item({ id: 'pi-x' }), U) }, at(1));
    const rep2 = await runOutboxSync({ ...deps, store: store2, saveEntity: async () => ({ error: { code: 'P0001', message: 'A punch list holds up to 500 items.' } }) });
    eq('sync: refused punch item kept with the reason', [rep2.refused.length, (await store2.getItems(U))[0]?.status !== undefined], [1, true]);
    const remapped = remapItem({ ...(items.find(i => i.docId === 'pi-1') as OutboxItem) }, new Map([['job-off', 'job-real']]));
    eq('remap: job id in the row and on the item', [remapped.jobId, remapped.data.job_id], ['job-real', 'job-real']);
}

{
    // migration lint
    const sql = readMigration('20261115000200_punch_lists.sql');
    const code = sql.replace(/--.*$/gm, '');
    ok('punch sql: RLS on both tables', /alter table public\.punch_lists enable row level security/.test(code) && /alter table public\.punch_items enable row level security/.test(code));
    ok('punch sql: owner policies for select/insert/update/delete', ['select', 'insert', 'update', 'delete'].every(op => new RegExp(`create policy punch_items_${op}_own on public\\.punch_items for ${op} to authenticated`).test(code)));
    ok('punch sql: anon has no table access', /revoke all on public\.punch_lists, public\.punch_items from anon/.test(code));
    const definers = code.match(/create or replace function[\s\S]*?\$\$;/g) || [];
    ok('punch sql: every function pins search_path', definers.length >= 4 && definers.every(f => /set search_path = ''/.test(f)));
    ok('punch sql: portal functions are SECURITY DEFINER and granted to anon', /function public\.get_portal_punch_list\(p_key text\)[\s\S]*?security definer/.test(code) && /grant execute on function public\.get_portal_punch_list\(text\)\s+to anon, authenticated/.test(code) && /grant execute on function public\.punch_item_feedback_via_portal\(text, uuid, boolean, text\)\s+to anon, authenticated/.test(code));
    ok('punch sql: portal key validated like get_portal_photos', (code.match(/p_key !~ '\^\[A-Za-z0-9_-\]\{32,128\}\$'/g) || []).length === 2);
    ok('punch sql: additive only (no drop table / alter of existing tables / delete)', !/drop table|alter table public\.(jobs|documents|clients|job_photos)|delete from|truncate (table )?public/i.test(code));
    ok('punch sql: client verification only from the portal function', /Only the client can verify an item as the client/.test(code));
}

// =====================================================================================================================
// 2. Papers vault + lien waivers
// =====================================================================================================================
{
    // expiry states
    eq('states around the expiry date', ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-22', '2026-11-23', '2026-12-15', '2026-12-16', ''].map(d => expiryState(d, TODAY).state),
        ['expired', 'urgent', 'urgent', 'urgent', 'soon', 'soon', 'ok', 'none']);
    eq('days left', [expiryState('2026-11-22', TODAY).days, expiryState('2026-11-10', TODAY).days], [7, -5]);
    eq('phrases', [expiryPhrase(0), expiryPhrase(1), expiryPhrase(7), expiryPhrase(-1), expiryPhrase(-3), expiryPhrase(null)], ['expires today', 'expires tomorrow', 'expires in 7 days', 'expired yesterday', 'expired 3 days ago', 'no expiry date']);

    // reminder schedule 30 / 7 / 1
    const exp = '2026-12-31';
    eq('steps of a paper', paperReminderSteps(exp).map(s => [s.offset, s.date]), [[30, '2026-12-01'], [7, '2026-12-24'], [1, '2026-12-30']]);
    eq('offsets: cleaned, largest first, max 4, defaults when missing', [normalizePaperOffsets([7, '30', 7, 0, 500, 1, 14, 60]), normalizePaperOffsets(undefined), normalizePaperOffsets([])], [[60, 30, 14, 7], [30, 7, 1], []]);
    const due = (today: string, sent: number[] = [], addedOn = '2026-01-01', offsets?: number[]) => duePaperStep({ expiresOn: exp, today, sent, addedOn, offsets })?.offset ?? null;
    eq('nothing before the 30-day step', due('2026-11-30'), null);
    eq('30 days before', due('2026-12-01'), 30);
    eq('a few days late still sends the 30-day step', due('2026-12-05'), 30);
    eq('never twice', due('2026-12-05', [30]), null);
    eq('7 days before (30 already sent)', due('2026-12-24', [30]), 7);
    eq('only the latest due step (30 missed → 7)', due('2026-12-25'), 7);
    eq('1 day before', due('2026-12-30', [30, 7]), 1);
    eq('on the expiry day the 1-day step can still go', due('2026-12-31', [30, 7]), 1);
    eq('after expiry: no more reminders', due('2027-01-01'), null);
    eq('added 5 days before expiry: steps before that day are dropped', due('2026-12-26', [], '2026-12-26'), null);
    eq('… and the 1-day reminder still comes', due('2026-12-30', [], '2026-12-26'), 1);
    eq('a later step went out: never go back to an earlier one', due('2026-12-24', [1]), null);
    eq('custom offsets', due('2026-11-01', [], '2026-01-01', [60, 14]), 60);
    eq('switched off', duePaperStep({ expiresOn: exp, today: '2026-12-30', enabled: false }), null);
    eq('dedupe key', paperDedupeKey('p-1', '2026-12-31T00:00:00Z', 7), 'paper:p-1:2026-12-31:-7');
    eq('next planned step', nextPaperStep({ expiresOn: exp, today: '2026-12-02', sent: [30] })?.date, '2026-12-24');
    const mail = paperReminderEmail({ title: 'GL <insurance>', kind: 'coi', number: 'A1', issuer: 'Acme Mutual', expiresOn: exp, today: '2026-12-24', appUrl: 'https://www.contractordocs.app/' });
    ok('email: subject says when', mail.subject.startsWith('Reminder: GL <insurance> expires in 7 days'));
    ok('email: html escaped, link to /papers', mail.html.includes('GL &lt;insurance&gt;') && mail.html.includes('https://www.contractordocs.app/papers') && !mail.html.includes('<insurance>'));
    ok('email: text has the details', mail.text.includes('Number: A1') && mail.text.includes('Issued by: Acme Mutual'));

    // the bell
    const now = Date.parse('2026-12-24T15:00:00');
    const n = derivePaperNotifications([
        { id: 'a', title: 'General liability', kind: 'coi', expiresOn: exp },
        { id: 'b', title: 'License', kind: 'license', expiresOn: '2026-12-20' },
        { id: 'c', title: 'Bond', kind: 'bond', expiresOn: '2027-03-01' },
        { id: 'd', title: 'Off', kind: 'permit', expiresOn: exp, remind: false },
        { id: 'e', title: 'Other user', kind: 'coi', expiresOn: exp, userId: 'someone-else' },
    ], { uid: 'me', now });
    eq('bell: expiring (at its step) and expired; far, switched-off and other users left out', n.map(x => [x.kind, x.id]), [['paper_expiring', 'paper:a:2026-12-31:-7'], ['paper_expired', 'paper:b:expired:2026-12-20']]);
    ok('bell: new item at each step (30 → 7)', derivePaperNotifications([{ id: 'a', title: 'GL', kind: 'coi', expiresOn: exp }], { uid: 'me', now: Date.parse('2026-12-10T12:00:00') })[0].id.endsWith(':-30'));

    // rows, sort, summary, files
    const p = mapPaperRow({ id: 'x', kind: 'nope', title: '', expires_on: '2026-12-31', reminder_offsets: [7, 30], coverage_amount: '1000000' });
    eq('odd rows are safe', [p.kind, p.title, p.reminderOffsets, p.coverageAmount], ['other', 'Document', [30, 7], 1000000]);
    const row = paperRowOf({ ...blankPaper('id-1', 'permit'), showInPortal: true, coverageAmount: 12.345 }, 'u1');
    eq('row: permits never show in the portal; money rounded', [row.show_in_portal, row.coverage_amount, row.title], [false, 12.35, 'Building permit']);
    eq('blank W-9 has no reminder', blankPaper('w', 'w9').remind, false);
    eq('problems', [paperProblems({ ...blankPaper('1', 'coi'), title: '' }).length > 0, paperProblems({ ...blankPaper('1', 'coi'), expiresOn: '' })[0], paperProblems({ ...blankPaper('1', 'coi'), issuedOn: '2027-01-01', expiresOn: '2026-01-01' })[0], paperProblems({ ...blankPaper('1', 'w9') }).length],
        [true, 'Add the expiry date, or switch reminders off.', 'The expiry date is before the issue date.', 0]);
    const list = [mapPaperRow({ id: '1', title: 'B', expires_on: '2027-06-01' }), mapPaperRow({ id: '2', title: 'A', expires_on: '' }), mapPaperRow({ id: '3', title: 'C', expires_on: '2026-11-01' }), mapPaperRow({ id: '4', title: 'D', expires_on: '2026-11-20' })];
    eq('sort: expired, closest, later, no date', sortPapers(list, TODAY).map(x => x.id), ['3', '4', '1', '2']);
    eq('summary', papersSummary(list, TODAY), { expired: 1, expiring: 1, valid: 1, noDate: 1, total: 4 });
    const path = paperFilePath('0e4d6c1a-1111-4222-8333-444455556666', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'r4nd0m!', 'Cert.PDF', '');
    ok('file path matches the database check', /^[0-9a-f-]{36}\/papers\/[A-Za-z0-9_-]{6,100}\.(pdf|jpg|jpeg|png|webp)$/.test(path) && path.endsWith('.pdf'));
    eq('file checks', [paperFileProblem({ type: 'application/pdf', size: 1000, name: 'a.pdf' }), paperFileProblem({ type: '', size: 1000, name: 'a.pdf' }), paperFileProblem({ type: 'image/heic', size: 1000, name: 'a.heic' }), paperFileProblem({ type: 'image/png', size: 16 * 1024 * 1024, name: 'a.png' })],
        ['', '', 'Use a PDF or a photo (JPG, PNG, WebP).', 'The file is larger than 15 MB.']);
    const em = sendPaperEmail(mapPaperRow({ id: '1', kind: 'coi', title: 'General liability', number: 'GL-9', expires_on: '2027-01-01' }), 'Atlas Builders', 'Morgan Client');
    ok('send COI email', em.subject === 'Certificate of insurance · Atlas Builders' && em.body.startsWith('Hi Morgan,') && em.body.includes('Number: GL-9') && em.body.trim().endsWith('Atlas Builders'));
}
{
    // lien waivers
    const forms = [
        { id: 'inv-1', type: 'Invoice', createdAt: '2026-10-01T00:00:00Z', data: { invoiceNumber: 'INV-2026-10-001', issueDate: '2026-10-01', status: 'Paid', lineItems: [{ quantity: 1, rate: 1000 }], taxRate: 10, payments: [{ id: 'pay-1', amount: 600, date: '2026-10-10', method: 'Check' }, { id: 'pay-2', amount: 500, date: '2026-10-20', method: 'Zelle' }] } },
        { id: 'inv-2', type: 'Invoice', createdAt: '2026-11-01T00:00:00Z', data: { invoiceNumber: 'INV-2026-11-002', issueDate: '2026-11-01', status: 'Sent', lineItems: [{ quantity: 2, rate: 250 }] } },
        { id: 'est', type: 'Estimate', data: {} },
    ];
    const inv = waiverInvoices(forms);
    eq('invoices: newest first, totals and payments', inv.map(i => [i.number, i.total, i.payments.length]), [['INV-2026-11-002', 500, 0], ['INV-2026-10-001', 1100, 2]]);
    const job = { name: 'Kitchen remodel', clientName: 'Morgan Client', clientAddress: '456 Oak Ave' };
    const profile = { companyName: 'Atlas Builders', name: 'Jordan Mitchell', defaultSignatureUrl: 'data:image/png;base64,AAAA' };
    const base = { job, profile, client: { name: 'Morgan Client', address: '456 Oak Ave' }, today: TODAY };
    const latest = waiverPrefill({ ...base, type: 'unconditional', scope: 'progress', invoice: inv[1] });
    eq('prefill: the latest payment by default', [latest.amount, latest.paymentDate, latest.throughDate, latest.paymentMethod, latest.invoiceNumber], [500, '2026-10-20', '2026-10-20', 'Zelle', 'INV-2026-10-001']);
    const first = waiverPrefill({ ...base, type: 'conditional', scope: 'progress', invoice: inv[1], paymentId: 'pay-1' });
    eq('prefill: a chosen payment', [first.amount, first.paymentDate], [600, '2026-10-10']);
    const none = waiverPrefill({ ...base, type: 'conditional', scope: 'final', invoice: inv[0], paymentId: null });
    eq('prefill: no payment → invoice total, no through date on a final waiver', [none.amount, none.paymentDate, none.throughDate], [500, '', '']);
    eq('prefill: names, address, claimant, signer, signature', [latest.claimant, latest.customer, latest.owner, latest.maker, latest.jobLocation, latest.signerName, latest.signatureDataUrl.startsWith('data:image/png')],
        ['Atlas Builders', 'Morgan Client', 'Morgan Client', 'Morgan Client', '456 Oak Ave', 'Jordan Mitchell', true]);
    eq('prefill: an https signature is not embedded (PDF needs data:)', waiverPrefill({ ...base, profile: { ...profile, defaultSignatureUrl: 'https://x/s.png' }, type: 'conditional', scope: 'final' }).signatureDataUrl, '');
    eq('prefill: without an invoice', [waiverPrefill({ ...base, type: 'conditional', scope: 'progress' }).amount, waiverPrefill({ ...base, type: 'conditional', scope: 'progress' }).throughDate], [0, TODAY]);
    eq('check: missing amount / address', waiverCheck({ ...latest, amount: 0, jobLocation: '' }).problems, ['Add the job address.', 'Add the payment amount.']);
    eq('check: unconditional without a payment warns', waiverCheck({ ...none, type: 'unconditional' }).warnings.length, 1);
    eq('titles', [lienWaiverTitle('conditional', 'progress'), lienWaiverTitle('unconditional', 'final')], ['Conditional Waiver and Release on Progress Payment', 'Unconditional Waiver and Release on Final Payment']);
    const html = buildLienWaiverHtml({ ...latest, customer: '<b>Evil</b>', exceptions: 'retention & CO-3' });
    ok('waiver html: escaped', !html.includes('<b>Evil</b>') && html.includes('&lt;b&gt;Evil&lt;/b&gt;') && html.includes('retention &amp; CO-3'));
    ok('waiver html: amount, through date, unconditional notice, signature image, state note', html.includes('$500.00') && html.includes('October 20, 2026') && html.includes('Do not sign it if you have not been paid') && html.includes('<img src="data:image/png;base64,AAAA"') && html.includes('statutory'));
    const cond = buildLienWaiverHtml({ ...none, signatureDataUrl: 'javascript:alert(1)' });
    ok('waiver html: conditional final wording, no unsafe signature', cond.includes('final payment') && !cond.includes('javascript:') && cond.includes('______________________________') && !cond.includes('Do not sign it'));
}
{
    const sql = readMigration('20261115000300_papers_vault.sql');
    const code = sql.replace(/--.*$/gm, '');
    ok('papers sql: RLS + owner policies', /alter table public\.company_papers\s+enable row level security/.test(code) && ['select', 'insert', 'update', 'delete'].every(op => new RegExp(`create policy company_papers_${op}_own on public\\.company_papers for ${op} to authenticated`).test(code)));
    ok('papers sql: reminder log written by the server only', /revoke insert, update, delete, truncate on public\.paper_reminders from authenticated/.test(code) && /constraint paper_reminders_user_dedupe_key unique \(user_id, dedupe_key\)/.test(code));
    ok('papers sql: Premium on insert (PLAN_LIMIT, hint papers)', /user_effective_tier\(new\.user_id\) not in \('premium', 'ai'\)/.test(code) && /hint = 'papers'/.test(code));
    ok('papers sql: reuses the document-assets bucket (no new bucket / storage policy)', !/insert into storage\.buckets|on storage\.objects/.test(code) && /\[0-9a-f-\]\{36\}\/papers\//.test(code));
    ok('papers sql: portal function is SECURITY DEFINER, anon-callable, no file paths', /function public\.get_portal_credentials\(p_key text\)[\s\S]*?security definer[\s\S]*?set search_path = ''/.test(code) && /grant execute on function public\.get_portal_credentials\(text\) to anon, authenticated/.test(code) && !/'file_path', p\.file_path/.test(code));
    ok('papers sql: additive only', !/drop table|alter table public\.(jobs|documents|clients|profiles|reminders)|delete from|truncate (table )?public/i.test(code));
    const fn = readFileSync(join(here, '..', 'supabase', 'functions', 'reminders', 'index.ts'), 'utf8');
    ok('reminders function runs the paper reminders (needs a redeploy)', /import \{ runPaperReminders \} from '\.\/papers\.ts'/.test(fn) && /await runPaperReminders\(admin, accounts, now/.test(fn));
    const pf = readFileSync(join(here, '..', 'supabase', 'functions', 'reminders', 'papers.ts'), 'utf8');
    ok('paper reminders: claim before send, to the sender address, paid plans only, quiet before the migration', /insert\(\{ \.\.\.base, status: 'sending' \}\)/.test(pf) && /to: sender\.gmail_address/.test(pf) && /=== 'free'\) continue/.test(pf) && /MISSING\.test/.test(pf));
}

// =====================================================================================================================
// 3. Recurring service plans
// =====================================================================================================================
const plan = (over: Partial<ServicePlan> = {}): ServicePlan => ({
    id: 'sp-1', clientId: 'c1', clientName: 'Morgan Client', clientAddress: '456 Oak Ave', jobId: 'job-sp', name: 'HVAC maintenance', service: 'Furnace and AC tune-up',
    price: 129, billing: 'per_visit', intervalUnit: 'month', intervalCount: 6, anchorDay: null, nextVisit: '2026-12-01', endsOn: '', assignedTo: 'Sam',
    leadDays: 14, remindClient: true, showInPortal: true, status: 'active', invoiceSourceId: null, visitsCreated: 0, notes: '', createdAt: '', ...over,
});
{
    // next-visit math (weeks, months, month ends, leap years) = SQL _service_next_date / _add_months_anchored
    eq('weekly / every 2 weeks', [nextVisitDate('2026-12-28', 'week', 1), nextVisitDate('2026-12-28', 'week', 2)], ['2027-01-04', '2027-01-11']);
    eq('twice a year from Nov 30', nextVisitDate('2026-11-30', 'month', 6), '2027-05-30');
    eq('month end clamps and comes back: Jan 31 → Feb 28 → Mar 31', [nextVisitDate('2027-01-31', 'month', 1, 31), nextVisitDate('2027-02-28', 'month', 1, 31)], ['2027-02-28', '2027-03-31']);
    eq('leap year: Feb 29 kept when it exists', [nextVisitDate('2028-01-31', 'month', 1, 31), nextVisitDate('2027-08-29', 'month', 6, 29)], ['2028-02-29', '2028-02-29']);
    eq('yearly from Feb 29 → Feb 28 → back to Feb 29 in a leap year', [nextVisitDate('2028-02-29', 'month', 12, 29), nextVisitDate('2031-02-28', 'month', 12, 29)], ['2029-02-28', '2032-02-29']);
    eq('quarterly across the year end', nextVisitDate('2026-11-30', 'month', 3, 30), '2027-02-28');
    eq('schedule keeps the anchor (31st)', upcomingVisitDates(plan({ nextVisit: '2027-01-31', intervalCount: 1, anchorDay: 31 }), 4), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
    eq('schedule stops at the end date', upcomingVisitDates(plan({ nextVisit: '2026-12-01', endsOn: '2027-06-01' }), 5), ['2026-12-01', '2027-06-01']);
    eq('frequency labels', [frequencyLabel('month', 6), frequencyLabel('week', 2), frequencyLabel('month', 5), frequencyLabel('week', 3)], ['Twice a year', 'Every 2 weeks', 'Every 5 months', 'Every 3 weeks']);

    // generation window = SQL _generate_service_visits
    eq('not yet: more than lead days ahead', dueVisits(plan({ nextVisit: '2026-12-01' }), '2026-11-16').create, []);
    eq('lead days reached: the visit is created, next one moves 6 months', dueVisits(plan({ nextVisit: '2026-12-01' }), '2026-11-17'), { create: ['2026-12-01'], skipped: [], nextVisit: '2027-06-01' });
    eq('weekly with 14 days lead: 3 visits at once', dueVisits(plan({ intervalUnit: 'week', intervalCount: 1, nextVisit: '2026-11-20' }), '2026-11-20').create, ['2026-11-20', '2026-11-27', '2026-12-04']);
    eq('far in the past: visits more than 30 days ago skipped, recent ones created', dueVisits(plan({ intervalUnit: 'month', intervalCount: 1, nextVisit: '2026-08-15', leadDays: 0 }), TODAY), { create: ['2026-11-15'], skipped: ['2026-08-15', '2026-09-15', '2026-10-15'], nextVisit: '2026-12-15' });
    eq('end date stops generation', dueVisits(plan({ intervalUnit: 'week', intervalCount: 1, nextVisit: '2026-11-20', endsOn: '2026-11-27' }), '2026-11-20').create, ['2026-11-20', '2026-11-27']);
    eq('paused: nothing', dueVisits(plan({ status: 'paused', nextVisit: '2026-11-15' }), TODAY).create, []);
    eq('idempotent: an existing visit is not made twice', dueVisits(plan({ nextVisit: '2026-11-20' }), TODAY, new Set(['2026-11-20'])).create, []);
    eq('at most 24 per run', dueVisits(plan({ intervalUnit: 'week', intervalCount: 1, nextVisit: '2026-11-15', leadDays: 60 }), '2027-12-31').create.length + dueVisits(plan({ intervalUnit: 'week', intervalCount: 1, nextVisit: '2026-11-15', leadDays: 60 }), '2027-12-31').skipped.length, 24);

    // invoices
    eq('per-visit Draft invoice: amount, due in 14 days', visitInvoicePreview(plan(), '2026-12-01'), { issueDate: '2026-12-01', dueDate: '2026-12-15', description: 'HVAC maintenance · visit Dec 1, 2026', total: 129 });
    eq('no per-visit invoice for period billing / free plans', [visitInvoicePreview(plan({ billing: 'annual' }), '2026-12-01'), visitInvoicePreview(plan({ price: 0 }), '2026-12-01')], [null, null]);
    eq('billing → recurring invoice frequency', (['per_visit', 'monthly', 'quarterly', 'semiannual', 'annual', 'none'] as PlanBilling[]).map(recurrenceFrequency), [null, 'Monthly', 'Quarterly', 'Bi-Annually', 'Annually', null]);
    const rec = recurringInvoiceFields(plan({ billing: 'annual', price: 480, nextVisit: '2027-01-31' }), 'line-1') as any;
    eq('recurring source invoice: dated the first visit, repeats yearly from the anchor', [rec.issueDate, rec.dueDate, rec.status, rec.recurrence, rec.lineItems[0].rate], ['2027-01-31', '2027-02-14', 'Draft', { enabled: true, frequency: 'Annually', nextRunDate: '2028-01-31', anchorDay: 31 }, 480]);
    const recM = recurringInvoiceFields(plan({ billing: 'monthly', price: 40, nextVisit: '2027-01-31' }), 'l') as any;
    eq('monthly from Jan 31: next run Feb 28 (the recurring engine keeps the anchor)', [recM.recurrence.nextRunDate, planRecurringCatchUp(recM.recurrence, '2027-03-31').due], ['2027-02-28', 2]);
    eq('per-visit billing has no recurring invoice', recurringInvoiceFields(plan(), 'x'), null);
    eq('labels and yearly value', [priceLabel(plan()), priceLabel(plan({ billing: 'annual', price: 480 })), priceLabel(plan({ billing: 'none' })), annualValue(plan()), annualValue(plan({ billing: 'quarterly', price: 100 })), annualValue(plan({ intervalUnit: 'week', intervalCount: 2, price: 50 }))],
        ['$129.00 per visit', '$480.00 per year', 'Not invoiced here', 258, 400, 1300]);

    // validation, rows, portal
    eq('problems', [planProblems(plan({ name: '' }), TODAY)[0], planProblems(plan({ clientId: null, clientName: '' }), TODAY)[0], planProblems(plan({ nextVisit: '2026-09-01' }), TODAY)[0], planProblems(plan({ endsOn: '2026-11-30' }), TODAY)[0], planProblems(plan({ price: 0 }), TODAY)[0], planProblems(plan({ price: 0, billing: 'none' }), TODAY).length],
        ['Name the plan (e.g. HVAC maintenance).', 'Pick the client.', 'The first visit is more than 30 days ago: pick the next one to come.', 'The end date is before the first visit.', 'Add the price, or choose “Not invoiced here”.', 0]);
    const row = planRowOf(plan({ intervalUnit: 'week', intervalCount: 99, leadDays: 90, price: 12.345 }), 'u1');
    eq('row: counts and lead days clamped, money rounded', [row.interval_count, row.lead_days, row.price, row.user_id, row.job_id], [52, 60, 12.35, 'u1', 'job-sp']);
    eq('row: a new plan without a job lets the database make one', 'job_id' in planRowOf(plan({ jobId: null }), 'u1'), false);
    eq('row: anchor day kept for month plans (month ends), cleared for week plans', [planRowOf(plan({ anchorDay: 31, nextVisit: '2027-02-28' }), 'u1').anchor_day, planRowOf(plan({ anchorDay: null }), 'u1').anchor_day, planRowOf(plan({ intervalUnit: 'week', anchorDay: 31 }), 'u1').anchor_day], [31, null, null]);
    const odd = mapPlanRow({ id: 'x', billing: 'weird', interval_unit: 'day', interval_count: 0, status: 'gone', price: '-5' });
    eq('odd rows are safe', [odd.billing, odd.intervalUnit, odd.intervalCount, odd.status, odd.price, odd.leadDays], ['per_visit', 'month', 1, 'active', 0, 14]);
    eq('visit rows', mapVisitRow({ id: 'v', plan_id: 'p', scheduled_for: '2026-12-01', status: 'nope' }).status, 'scheduled');
    const portal = parsePortalPlans([{ id: 'p', name: 'Pool service', price: 90, billing: 'monthly', interval_unit: 'week', interval_count: 1, status: 'active', next_visit: '2026-11-20', last_visit: '2026-11-13' }, { name: 'no id' }, 7]);
    eq('portal plans', portal, [{ id: 'p', name: 'Pool service', service: '', priceLabel: '$90.00 per month', frequency: 'Every week', status: 'active', nextVisit: '2026-11-20', lastVisit: '2026-11-13' }]);

    // the bell
    const n = deriveServiceVisitNotifications([
        { id: 'v1', jobId: 'j', planName: 'HVAC', scheduledFor: '2026-11-16', status: 'scheduled' },
        { id: 'v2', planName: 'Pool', scheduledFor: '2026-11-20', status: 'scheduled' },
        { id: 'v3', planName: 'Done one', scheduledFor: '2026-11-15', status: 'done' },
    ], { uid: 'me', now: Date.parse('2026-11-15T12:00:00') });
    eq('bell: visits within 2 days that are still scheduled', n.map(x => [x.id, x.text]), [['visit:v1:2026-11-16', 'Service visit tomorrow: HVAC']]);
}
{
    const sql = readMigration('20261115000400_service_plans.sql');
    const code = sql.replace(/--.*$/gm, '');
    ok('plans sql: RLS + owner policies', /alter table public\.service_plans\s+enable row level security/.test(code) && ['select', 'insert', 'update', 'delete'].every(op => new RegExp(`create policy service_plans_${op}_own on public\\.service_plans for ${op} to authenticated`).test(code)));
    ok('plans sql: visits written only by the functions', /revoke insert, update, truncate on public\.service_visits from authenticated/.test(code) && /constraint service_visits_plan_day_key unique \(plan_id, scheduled_for\)/.test(code) && /on conflict \(plan_id, scheduled_for\) do nothing/.test(code));
    ok('plans sql: Premium on insert and for generation', /hint = 'service_plans'/.test(code) && /user_effective_tier\(p_user_id\) not in \('premium', 'ai'\)/.test(code));
    ok('plans sql: same month math as recurring invoices', /public\._add_months_anchored\(p_date/.test(code));
    ok('plans sql: generation rules match lib/servicePlans.ts (lead days, 30 days, 24 per run)', /v_next - pl\.lead_days <= v_today and v_iter < 24/.test(code) && /v_next >= v_today - 30/.test(code));
    ok('plans sql: per-visit invoice is a Draft due 14 days later', /'status', 'Draft'\)\)/.test(code) && /p_date \+ 14/.test(code) && /'status', 'Scheduled'/.test(code));
    ok('plans sql: cron job hourly, documented', /cron\.schedule\('contractordocs-service-visits', '15 \* \* \* \*', 'select public\.service_plans_cron_tick\(\)'\)/.test(code));
    ok('plans sql: cron tick only for the service role, portal for anon', /grant execute on function public\.service_plans_cron_tick\(\)\s+to service_role;/.test(code) && /grant execute on function public\.get_portal_service_plans\(text\)\s+to anon, authenticated;/.test(code));
    const fns = code.match(/create or replace function[\s\S]*?\$\$;/g) || [];
    ok('plans sql: every function pins search_path', fns.length >= 11 && fns.every(f => /set search_path = ''/.test(f)));
    ok('plans sql: anchor day only reset when the app clears it', /if new\.interval_unit = 'month' and new\.anchor_day is null then/.test(code) && !/v_reanchor/.test(code));
    ok('punch sql: the item guard is not SECURITY DEFINER (tells the browser from the portal function)', /function public\.guard_punch_item\(\)\s*returns trigger\s*language plpgsql\s*set search_path = ''/.test(readMigration('20261115000200_punch_lists.sql')));
    ok('plans sql: OLD is only read in UPDATE branches', !/tg_op = 'INSERT' or [^;]*old\./i.test(code) && !/tg_op = 'UPDATE' and [^;]*old\./i.test(code));
    ok('plans sql: additive only', !/drop table|alter table public\.(jobs|documents|clients|reminder_overrides)|delete from|truncate (table )?public/i.test(code));
    for (const f of ['20261115000200_punch_lists.sql', '20261115000300_papers_vault.sql']) {
        const c = readMigration(f).replace(/--.*$/gm, '');
        ok(`${f}: OLD is only read in UPDATE branches`, !/tg_op = 'INSERT' or [^;]*old\./i.test(c) && !/tg_op = 'UPDATE' and [^;]*old\./i.test(c));
    }
    // every function body opens with "as $$" (a missing one makes the whole file fail in the SQL editor)
    for (const f of ['20261115000100_crew_clock_in.sql', '20261115000200_punch_lists.sql', '20261115000300_papers_vault.sql', '20261115000400_service_plans.sql']) {
        const c = readMigration(f).replace(/\r\n/g, '\n');
        ok(`${f}: every function body starts with "as $$"`, !/set search_path = ''\n(declare|begin)\b/.test(c));
    }
}
{
    // the assistant finds the new features (retrieval) and every new screen is a real route
    for (const [q, id] of [
        ['how do I make a punch list for the final walkthrough?', 'punch-list-detail'],
        ['where do I keep my insurance certificate and get reminded before it expires?', 'papers-vault'],
        ['send my COI to a general contractor', 'papers-vault'],
        ['how do I make a conditional lien waiver?', 'lien-waivers'],
        ['set up an HVAC maintenance plan twice a year', 'service-plans-detail'],
        ['can I make an invoice repeat every month?', 'recurring-invoices'],
    ] as const) ok(`assistant: "${q}" → ${id}`, retrieveKnowledge(q).some(e => e.id === id));
    eq('new screens are real routes', ['/papers', '/service-plans'].map(r => parseView(r, '', null).screen), ['papers', 'servicePlans']);
    ok('new routes are navigation targets with labels', ['/papers', '/service-plans'].every(r => (NAV_ROUTES as readonly string[]).includes(r) && !!NAV_LABELS[r as keyof typeof NAV_LABELS]));
    ok('help guides exist', ['punch-list', 'papers', 'service-plans'].every(id => HELP_GUIDES.some(g => g.id === id)));
}

// =====================================================================================================================
async function main() {
    await offlinePunch();
    console.log(`field-features-check: ${passes} passed, ${failures} failed`);
    if (failures) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
