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
import { derivePunchNotifications } from '../lib/notifications/model.ts';

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
async function main() {
    await offlinePunch();
    console.log(`field-features-check: ${passes} passed, ${failures} failed`);
    if (failures) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
