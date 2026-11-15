/**
 * Client portal project dashboard (roadmap D9): pure-logic checks (lib/portal/dashboardLogic.ts) and a lint of
 * supabase/migrations/20261116000300_portal_project_dashboard.sql (one read-only function, security definer,
 * search_path '', grants like the sibling portal reads, milestone-safe task columns only). No database needed:
 *   npx tsx scripts/portal-dashboard-check.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    balanceSummary, buildDashboardView, collapseTimeline, docNumberOf, fmtYmd, isInvoiceOverdue, jobDatesText, jobStatusLabel,
    milestoneState, milestoneWhenText, nextMilestoneText, nextStepAction, ownerPreviewDashboard, paidPercent, parseDashboard,
    pickDefaultJob, progressLabel, punchLabel, stepActionLabel, timelineItems, visibleSections,
} from '../lib/portal/dashboardLogic.ts';
import { DASHBOARD_KEYS, DASHBOARD_LIMITS, MILESTONE_KEYS } from '../lib/portal/dashboardTypes.ts';
import { READ_ONLY_RPCS } from '../lib/offline/writePathScan.ts';

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

const NOW = new Date(2026, 10, 20, 12, 0, 0); // Nov 20 2026, local
const TODAY = '2026-11-20';

// ============================================================================================ parsing
const inv = (id: string, data: Record<string, any>, created = '2026-11-01T10:00:00Z') => ({ id, type: 'Invoice', created_at: created, state: 'readonly', data });
const RAW = {
    version: 1,
    jobs: [{ id: 'j1', name: 'Kitchen', status: 'active', start_date: '2026-11-03', end_date: '2026-12-20' }, { bad: true }],
    job: { id: 'j1', name: 'Kitchen', address: '1 Main St', status: 'active', start_date: '2026-11-03', end_date: '2026-12-20' },
    contractor: { name: 'Bob', company_name: 'Bob Build', phone: '555', email: 'b@x.com', logo_url: null, website: null, address: null },
    progress: { done: 7, total: 12, percent: 58 },
    milestones: [
        { id: 'm1', title: 'Demo done', due_date: '2026-11-05', status: 'done', completed_at: '2026-11-06T09:00:00Z' },
        { id: 'm2', title: 'Rough-in', due_date: '2026-11-18', status: 'doing', completed_at: null },
        { id: 'm3', title: 'Drywall done', due_date: '2026-11-24', status: 'todo', completed_at: null },
        { id: 'm4', title: 'Final walkthrough', due_date: null, status: 'todo', completed_at: null },
        { id: '', title: 'no id' },
    ],
    next_milestone: { id: 'm2', title: 'Rough-in', due_date: '2026-11-18', status: 'doing', completed_at: null },
    documents: [
        inv('d1', { invoiceNumber: '1001', status: 'Sent', dueDate: '2026-11-10', lineItems: [{ quantity: 2, rate: 500 }], taxRate: 10, amountPaid: 100 }),
        inv('d2', { invoiceNumber: '1002', status: 'Paid', lineItems: [{ quantity: 1, rate: 300 }] }, '2026-11-02T10:00:00Z'),
        inv('d3', { invoiceNumber: '1003', status: 'Sent', dueDate: '2026-12-01', lineItems: [{ quantity: 1, rate: 250.5 }] }, '2026-11-03T10:00:00Z'),
        inv('d4', { invoiceNumber: '1004', status: 'Cancelled', lineItems: [{ quantity: 1, rate: 9999 }] }, '2026-11-04T10:00:00Z'),
        { id: 'e1', type: 'Estimate', created_at: '2026-11-15T10:00:00Z', state: 'open', data: { estimateNumber: '12', status: 'Sent', lineItems: [{ quantity: 1, rate: 1000 }] } },
        { id: 'x1', type: 'Purchase Order', created_at: '2026-11-15T10:00:00Z', data: {} },
        { id: 'x2', type: 'Invoice', created_at: '2026-11-15T10:00:00Z', data: { status: 'Draft' } },
    ],
    photos: [{ id: 'p1', tag: 'progress', caption: 'Cabinets', taken_at: '2026-11-19T10:00:00Z', path: 'u/j1/p1.jpg' }, { id: 'p2', path: '' }],
    punch: { total: 8, open: 2, done: 1, verified: 5 },
    selections: [],
};

const parsed = parseDashboard(RAW);
eq('jobs: bad rows dropped', parsed.jobs.map(j => j.id), ['j1']);
eq('job address', parsed.job?.address, '1 Main St');
eq('milestones: bad rows dropped', parsed.milestones.map(m => m.id), ['m1', 'm2', 'm3', 'm4']);
eq('documents: internal types and Drafts dropped', parsed.documents.map(d => d.id), ['d1', 'd2', 'd3', 'd4', 'e1']);
eq('photos: rows without a path dropped', parsed.photos.map(p => p.id), ['p1']);
eq('contractor mapped', [parsed.contractor.companyName, parsed.contractor.phone, parsed.contractor.logoUrl], ['Bob Build', '555', '']);
eq('string payload parses', parseDashboard(JSON.stringify(RAW)).jobs.length, 1);
eq('garbage never throws', parseDashboard('not json').milestones, []);
eq('null payload', parseDashboard(null).job, null);
eq('progress null when no tasks', parseDashboard({ progress: { done: 0, total: 0 } }).progress, null);
eq('progress percent recomputed', parseDashboard({ progress: { done: 1, total: 3, percent: 99 } }).progress, { done: 1, total: 3, percent: 33 });
eq('punch null when not shared', parseDashboard({ punch: null }).punch, null);
eq('photo cap', parseDashboard({ photos: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, path: `x/${i}.jpg` })) }).photos.length, DASHBOARD_LIMITS.photos);
eq('unknown task status -> todo', parseDashboard({ milestones: [{ id: 'a', title: 'A', status: 'weird' }] }).milestones[0].status, 'todo');

// ============================================================================================ helpers
eq('fmtYmd', fmtYmd('2026-11-03'), 'Nov 3, 2026');
eq('fmtYmd same year', fmtYmd('2026-11-03', TODAY), 'Nov 3');
eq('fmtYmd bad', fmtYmd('soon'), '');
eq('job status label', [jobStatusLabel('active'), jobStatusLabel('completed'), jobStatusLabel('paused'), jobStatusLabel('custom')], ['In progress', 'Completed', 'On hold', 'Custom']);
eq('job dates range', jobDatesText({ startDate: '2026-11-03', endDate: '2026-12-20' }, TODAY), 'Nov 3 - Dec 20, 2026');
eq('job dates start ahead', jobDatesText({ startDate: '2026-12-01', endDate: null }, TODAY), 'Starts Dec 1, 2026');
eq('job dates none', jobDatesText({ startDate: null, endDate: null }, TODAY), '');
eq('progress label', progressLabel({ done: 7, total: 12, percent: 58 }), '7 of 12 steps done');
eq('progress label one', progressLabel({ done: 0, total: 1, percent: 0 }), '0 of 1 step done');
eq('progress label none', progressLabel(null), '');
eq('milestone states', parsed.milestones.map(m => milestoneState(m, TODAY)), ['done', 'overdue', 'due_soon', 'no_date']);
eq('milestone when', parsed.milestones.map(m => milestoneWhenText(m, TODAY)), ['Done Nov 6', 'Planned for Nov 18', 'Due in 4 days', 'No date yet']);
eq('milestone due today', milestoneWhenText({ id: 'a', title: 'A', dueDate: TODAY, status: 'todo', completedAt: null }, TODAY), 'Due today');
eq('milestone far', milestoneWhenText({ id: 'a', title: 'A', dueDate: '2027-01-15', status: 'todo', completedAt: null }, TODAY), 'Due Jan 15, 2027');
eq('next milestone text', nextMilestoneText(parsed.milestones[2], TODAY), 'Next: Drywall done, due in 4 days');
eq('next milestone no date', nextMilestoneText(parsed.milestones[3], TODAY), 'Next: Final walkthrough (no date yet)');
eq('next milestone none', nextMilestoneText(null, TODAY), '');
eq('punch label', punchLabel({ total: 8, open: 2, done: 1, verified: 5 }), '2 open, 1 to check, 5 verified');
eq('punch label empty', punchLabel({ total: 0, open: 0, done: 0, verified: 0 }), '');
eq('doc number keys', [docNumberOf({ invoiceNumber: '7' }), docNumberOf({ changeOrderNumber: 'CO-2' }), docNumberOf({})], ['7', 'CO-2', '']);
ok('overdue invoice', isInvoiceOverdue(parsed.documents[0], TODAY));
ok('not overdue: future due', !isInvoiceOverdue(parsed.documents[2], TODAY));
ok('not overdue: paid', !isInvoiceOverdue(parsed.documents[1], TODAY));

// ============================================================================================ balance
const bal = balanceSummary(parsed.documents, TODAY)!;
// d1 1100 (100 paid) + d2 300 (Paid) + d3 250.50; d4 Cancelled left out
eq('balance totals', [bal.total, bal.paid, bal.outstanding], [1650.5, 400, 1250.5]);
eq('balance counts', [bal.invoiceCount, bal.unpaidCount, bal.overdueCount], [3, 2, 1]);
eq('balance text', [bal.totalText, bal.outstandingText], ['$1,650.50', '$1,250.50']);
eq('balance none without invoices', balanceSummary([], TODAY), null);

// ============================================================================================ view
const view = buildDashboardView(parsed, NOW);
eq('view status', [view.statusLabel, view.datesText, view.progressLabel], ['In progress', 'Nov 3 - Dec 20, 2026', '7 of 12 steps done']);
eq('view next milestone (server pick, overdue)', view.nextMilestone?.id, 'm2');
eq('view rows newest first', view.documents.map(r => r.id), ['e1', 'd4', 'd3', 'd2', 'd1']);
const e1 = view.documents[0];
eq('estimate row', [e1.label, e1.awaitingSignature, e1.totalText], ['Estimate #12', true, '$1,000.00']);
const d1 = view.documents.find(r => r.id === 'd1')!;
eq('invoice row', [d1.label, d1.total, d1.balanceDue, d1.overdue, d1.date], ['Invoice #1001', 1100, 1000, true, '2026-11-01']);
eq('next steps order', view.nextSteps.map(s => s.kind), ['sign', 'pay_overdue', 'milestone_overdue', 'pay', 'punch_check']);
eq('next steps text', view.nextSteps.map(s => s.text), [
    'Review and approve Estimate #12',
    'Pay Invoice #1001 ($1,000.00, past due)',
    'Rough-in (planned for Nov 18)',
    'Pay Invoice #1003 ($250.50)',
    'Check 1 finished punch item',
]);
eq('view punch label', view.punchLabel, '2 open, 1 to check, 5 verified');
eq('view selections placeholder', view.selections, []);
const quiet = buildDashboardView(parseDashboard({ job: { id: 'j', name: 'Deck', status: 'inactive', start_date: '2026-12-01' } }), NOW);
eq('quiet job: start date step only', quiet.nextSteps.map(s => s.text), ['Work starts Dec 1']);
eq('quiet job: no balance / progress', [quiet.balance, quiet.progress, quiet.progressLabel], [null, null, '']);

// ============================================================================================ portal screen helpers
const J = (id: string, status: string) => ({ id, name: id, status, startDate: null, endDate: null });
eq('default job: in progress first', pickDefaultJob([J('a', 'completed'), J('b', 'active'), J('c', 'active')])?.id, 'b');
eq('default job: else not completed', pickDefaultJob([J('a', 'completed'), J('b', 'inactive')])?.id, 'b');
eq('default job: all completed -> newest', pickDefaultJob([J('a', 'completed'), J('b', 'completed')])?.id, 'a');
eq('default job: none', pickDefaultJob([]), null);

const tl = timelineItems(view.milestones, view.nextMilestone);
eq('timeline roles', tl.map(t => t.role), ['done', 'next', 'upcoming', 'upcoming']);
eq('timeline without a next one', timelineItems(view.milestones, null).map(t => t.role), ['done', 'upcoming', 'upcoming', 'upcoming']);
const mk = (id: string, status: 'done' | 'todo') => ({ id, title: id, dueDate: null, status, completedAt: null, state: status === 'done' ? 'done' as const : 'no_date' as const, whenText: '' });
const long = timelineItems([mk('d1', 'done'), mk('d2', 'done'), mk('d3', 'done'), mk('d4', 'done'), mk('d5', 'done'), mk('n1', 'todo'), mk('u1', 'todo')], mk('n1', 'todo'));
const folded = collapseTimeline(long, false);
eq('long timeline folds earlier finished steps', [folded.hiddenCount, folded.items.map(i => i.milestone.id)], [3, ['d4', 'd5', 'n1', 'u1']]);
eq('long timeline expanded', collapseTimeline(long, true).items.length, 7);
eq('short timeline never folds one row', collapseTimeline(long.slice(2), false).hiddenCount, 0);
eq('timeline: folds nothing when few finished', collapseTimeline(tl, false).hiddenCount, 0);

eq('step action sign', nextStepAction({ kind: 'sign', refId: 'e1' }), 'sign');
eq('step action sign without document', nextStepAction({ kind: 'sign', refId: null }), null);
eq('step action pay', [nextStepAction({ kind: 'pay', refId: 'd3' }), nextStepAction({ kind: 'pay_overdue', refId: 'd1' })], ['open', 'open']);
eq('step action punch', nextStepAction({ kind: 'punch_check', refId: null }), 'punch');
eq('step action none for milestones / start', [nextStepAction({ kind: 'milestone', refId: 'm' }), nextStepAction({ kind: 'job_start', refId: null }), nextStepAction({ kind: 'milestone_overdue', refId: 'm' })], [null, null, null]);
eq('step action labels', [stepActionLabel('sign'), stepActionLabel('open'), stepActionLabel('punch')], ['Review', 'Open', 'See list']);
eq('paid percent', [paidPercent(bal), paidPercent(null), paidPercent({ total: 0, paid: 0 }), paidPercent({ total: 100, paid: 150 })], [24, 0, 0, 100]);

eq('sections: full project', visibleSections(view), ['header', 'progress', 'milestones', 'next', 'balance', 'documents', 'photos', 'punch']);
eq('sections: quiet job', visibleSections(quiet), ['header', 'next']);
const bare = buildDashboardView(parseDashboard({ job: { id: 'j', name: 'Deck', status: 'active' } }), NOW);
eq('sections: nothing to show -> header only', visibleSections(bare), ['header']);
eq('sections: no job -> nothing', visibleSections(buildDashboardView(parseDashboard(null), NOW)), []);
const noTasks = buildDashboardView(parseDashboard({ ...RAW, progress: null, milestones: [], next_milestone: null }), NOW);
ok('no tasks: no progress bar', !visibleSections(noTasks).includes('progress'));
ok('no milestones: no timeline', !visibleSections(noTasks).includes('milestones'));
const noPhotos = buildDashboardView(parseDashboard({ ...RAW, photos: [] }), NOW);
ok('no photos: no photo strip', !visibleSections(noPhotos).includes('photos'));
const noPunch = buildDashboardView(parseDashboard({ ...RAW, punch: null }), NOW);
ok('punch not shared: no punch line', !visibleSections(noPunch).includes('punch'));
ok('empty punch list: no punch line', !visibleSections(buildDashboardView(parseDashboard({ ...RAW, punch: { total: 0, open: 0, done: 0, verified: 0 } }), NOW)).includes('punch'));
const noDocs = buildDashboardView(parseDashboard({ ...RAW, documents: [] }), NOW);
ok('no documents: no balance, no list', !visibleSections(noDocs).some(x => x === 'balance' || x === 'documents'));
ok('selections shown only when there are some',
    !visibleSections(view).includes('selections') && visibleSections(buildDashboardView(parseDashboard({ ...RAW, selections: [{}] }), NOW)).includes('selections'));
eq('step "pay" row opens the document it names', view.nextSteps.filter(s => nextStepAction(s) === 'open').map(s => s.refId), ['d1', 'd3']);

// ============================================================================================ owner preview
const preview = ownerPreviewDashboard({
    job: { id: 'j1', name: 'Kitchen', clientAddress: '1 Main St', status: 'active', startDate: '2026-11-03', endDate: null },
    tasks: [
        { id: 't1', title: 'Secret internal task', status: 'done' },
        { id: 't2', title: 'Cabinets in', status: 'todo', isMilestone: true, dueDate: '2026-11-25' },
        { id: 't3', title: 'Demo', status: 'done', isMilestone: true, dueDate: '2026-11-04', completedAt: '2026-11-04T10:00:00Z' },
    ],
    documents: [
        { id: 'a', type: 'Invoice', createdAt: '2026-11-01T00:00:00Z', data: { status: 'Sent', lineItems: [{ quantity: 1, rate: 100 }] } },
        { id: 'b', type: 'Purchase Order', createdAt: '2026-11-01T00:00:00Z', data: {} },
        { id: 'c', type: 'Invoice', createdAt: '2026-11-02T00:00:00Z', data: { status: 'Draft' } },
    ],
    photos: [
        { id: 'p1', sharedInPortal: true, portalPath: 'x/1.jpg', takenAt: '2026-11-01' },
        { id: 'p2', sharedInPortal: false, portalPath: 'x/2.jpg', takenAt: '2026-11-02' },
    ],
    punch: { shared: false, items: [{ status: 'open' }] },
});
eq('preview progress counts all tasks', preview.progress, { done: 2, total: 3, percent: 67 });
eq('preview milestones only', preview.milestones.map(m => m.title), ['Demo', 'Cabinets in']);
eq('preview next milestone', preview.nextMilestone?.id, 't2');
eq('preview documents filtered', preview.documents.map(d => d.id), ['a']);
eq('preview shared photos only', preview.photos.map(p => p.id), ['p1']);
eq('preview punch hidden when not shared', preview.punch, null);
ok('preview never carries a non-milestone title', !JSON.stringify(preview).includes('Secret internal task'));

// ============================================================================================ migration lint
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sqlRaw = readFileSync(join(root, 'supabase/migrations/20261116000300_portal_project_dashboard.sql'), 'utf8').replace(/\r\n/g, '\n');
// comments out, so the lint reads only code
const sql = sqlRaw.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');

ok('header: not applied yet', sqlRaw.startsWith('-- Applied: NOT YET (needs owner OK)'));
eq('exactly one function', (sql.match(/create\s+(or\s+replace\s+)?function/gi) || []).length, 1);
ok('create or replace', /create or replace function public\.get_portal_project_dashboard\(p_key text, p_job_id uuid default null\)/.test(sql));
ok('security definer', /\n\s*security definer\s*\n/.test(sql));
ok("set search_path = ''", /\n\s*set search_path = ''\s*\n/.test(sql));
ok('body opens with as $$', /set search_path = ''\nas \$\$\n/.test(sql));
ok('stable', /\n\s*stable\s*\n/.test(sql));
for (const word of ['insert', 'update', 'delete', 'truncate', 'drop', 'alter', 'create table', 'create policy', 'create trigger', 'create index']) {
    ok(`read only: no ${word}`, !new RegExp(`\\b${word}\\b`, 'i').test(sql));
}
ok('no unqualified table reads', !/\b(from|join)\s+(?!public\b|\(|lateral\b)[a-z_]+/i.test(sql));
ok('invalid link answer like siblings', (sql.match(/raise exception 'Invalid portal link' using errcode = '28000'/g) || []).length === 3);
ok('key format check like siblings', sql.includes("p_key !~ '^[A-Za-z0-9_-]{32,128}$'"));
ok('revoke from public, anon, authenticated', sql.includes('revoke all on function public.get_portal_project_dashboard(text, uuid) from public, anon, authenticated;'));
ok('grant to anon, authenticated', sql.includes('grant execute on function public.get_portal_project_dashboard(text, uuid) to anon, authenticated;'));
eq('no other grants', (sql.match(/\bgrant\b/gi) || []).length, 1);
ok('no service_role / public grant', !/to\s+(public|service_role)\b/i.test(sql));

// returned top-level keys = DASHBOARD_KEYS (both branches)
const jobsOnly = sql.slice(sql.indexOf('if p_job_id is null then'), sql.indexOf('end if;', sql.indexOf('if p_job_id is null then')));
const fullBody = sql.slice(sql.lastIndexOf('return jsonb_build_object('));
const keysAt = (text: string, indent: number) => [...text.matchAll(new RegExp(`^ {${indent}}'([a-z_]+)',`, 'gm'))].map(m => m[1]);
eq('job-list answer keys', keysAt(jobsOnly, 6), [...DASHBOARD_KEYS]);
eq('dashboard answer keys', keysAt(fullBody, 4), [...DASHBOARD_KEYS]);

// job_tasks: only milestone-safe columns are selected, every row of the milestone lists is a milestone
const taskCols = new Set<string>();
for (const m of sql.matchAll(/\b[tm]\.([a-z_]+)/g)) taskCols.add(m[1]);
const allowedTaskCols = new Set([...MILESTONE_KEYS, 'job_id', 'user_id', 'is_milestone', 'sort_order', 'created_at']);
for (const c of taskCols) ok(`job_tasks column ${c} allowed`, allowedTaskCols.has(c));
for (const c of ['notes', 'crew_member_id', 'depends_on', 'completed_photo_path', 'work_order_doc_id', 'source', 'start_date']) {
    ok(`job_tasks.${c} never read`, !new RegExp(`\\bt\\.${c}\\b`).test(sql));
}
ok('no task_comments', !/task_comments/.test(sql));
ok('no crew tables', !/crew_/.test(sql));
const milestoneObjs = [...sql.matchAll(/'milestones', coalesce\(\(\s*select jsonb_agg\(jsonb_build_object\(([^)]*)\)/g), ...sql.matchAll(/'next_milestone', \(\s*select jsonb_build_object\(([^)]*)\)/g)];
eq('two milestone objects', milestoneObjs.length, 2);
for (const m of milestoneObjs) {
    const keys = [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
    eq('milestone keys', keys, [...MILESTONE_KEYS]);
}
eq('milestone filters', (sql.match(/and t\.is_milestone/g) || []).length, 2);
ok('jobs.worker_name never returned', !/worker_name/.test(sql));
ok('documents via _client_document_ids', sql.includes('d.id in (select public._client_document_ids(v_client.id))'));
ok('documents: no drafts', sql.includes("coalesce(d.data->>'status', '') <> 'Draft'"));
ok('documents: client-safe data', sql.includes("'data', public._client_safe_doc_data(x.data)"));
ok('documents: no public_token', !/public_token/.test(sql));
ok('photos: shared only', sql.includes('and ph.shared_in_portal') && sql.includes('and ph.portal_path is not null'));
ok('punch: shared only', sql.includes('and l.shared_in_portal'));
ok('job must be the client\'s', /where j\.id = p_job_id\s+and j\.user_id = v_client\.user_id/.test(sql));
ok('empty client name never matches', (sql.match(/btrim\(coalesce\(v_client\.name, ''\)\) <> ''/g) || []).length === 2);
eq('limits', [...sql.matchAll(/\blimit (\d+)/g)].map(m => Number(m[1])), [DASHBOARD_LIMITS.jobs, DASHBOARD_LIMITS.milestones, 1, DASHBOARD_LIMITS.documents, DASHBOARD_LIMITS.photos]);
ok('selections placeholder', (sql.match(/'selections', '\[\]'::jsonb/g) || []).length === 2);

// read-only RPC is known to the offline write-path scan
ok('READ_ONLY_RPCS has the dashboard', READ_ONLY_RPCS.has('get_portal_project_dashboard'));
const api = readFileSync(join(root, 'lib/portal/dashboardApi.ts'), 'utf8');
ok('api calls the rpc by its literal name', api.includes("rpc('get_portal_project_dashboard'"));
ok('api falls back when the function is missing', api.includes('isMissingBackendError'));

console.log(`portal-dashboard-check: ${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
