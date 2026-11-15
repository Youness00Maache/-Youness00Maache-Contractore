/**
 * Job tasks + schedule (roadmap batch D2). Pure logic and a lint of the migration; no database needed:
 *   npx tsx scripts/job-tasks-check.ts
 *
 * Covers: dates, overdue / today / upcoming grouping, progress, ordering, dependency validation + cycle detection,
 * blocked-by-dependency status, moving dependents (same days / only as needed), timeline layout (rows, bars, clipping,
 * milestones, links, today line), critical path, proposals -> drafts, templates (parse, size check, instantiate,
 * save-as-template, starters), row mapping, crew link answers, work order -> proposed tasks, the AI extraction
 * validation (due phrases, crew names, dependencies), and the migration (RLS owner-only, SECURITY DEFINER +
 * search_path = '', every body opens with "as $$", no destructive statement, anon grants only for the crew link).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    addDays, allDependents, criticalPath, daysBetween, directDependents, displayStatus, findCycle, groupTasksByWhen, instantiateTemplate,
    isOverdue, isTaskStatus, isWaitingOnOthers, isYmd, layoutTimeline, nextSortOrder, overdueDays, parseTaskTemplates, proposalsToDrafts,
    pushDependents, reorderPatches, serializeTaskTemplates, shiftDependents, sortTasks, STARTER_TASK_TEMPLATES, taskProgress, taskSpan,
    taskWhen, templateFromTasks, timelineWindow, todayYmd, topologicalOrder, unfinishedDependencies, validateDependencies, wouldCreateCycle,
    type TaskLike,
} from '../lib/tasks/taskLogic.ts';
import {
    crewAnswerError, mapCommentRow, mapCrewTaskUpdate, mapCrewTasksView, mapTaskRow, TASK_COLUMNS, taskInsertRow, taskPatchRow,
} from '../lib/tasks/taskRows.ts';
import { TASK_LIMITS, TASK_SOURCES, TASK_STATUSES, TASK_TEMPLATES_SETTING, TEMPLATE_LIMITS, type ProposedTask, type TaskTemplate } from '../lib/tasks/taskTypes.ts';
import { isWorkOrderDocument, tasksForWorkOrder, textLines, workOrderTaskProgress, workOrderToProposedTasks } from '../lib/tasks/workOrderTasks.ts';
import {
    buildExtractTasksSchema, buildExtractTasksSystemPrompt, buildExtractTasksUserText, isExtractTasksBody, matchCrewName, mockExtractTasksOutput,
    normalizeExtractedTasks, resolveDueText, sanitizeExtractTasksRequest,
} from '../supabase/functions/ai-assistant/shared/taskExtraction.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); checks++; };
const eq = <T,>(a: T, b: T, msg: string) => { assert.deepEqual(a, b, msg); checks++; };
const throws = (fn: () => unknown, msg: string) => { assert.throws(fn, msg); checks++; };

const TODAY = '2026-11-12'; // a Thursday
const t = (id: string, o: Partial<TaskLike> = {}): TaskLike => ({
    id, status: 'todo', startDate: null, dueDate: null, dependsOn: [], isMilestone: false, sortOrder: 0, jobId: 'job-1', title: id, ...o,
});
let seq = 0;
const newId = () => `id-${++seq}`;

// ─────────────────────────────────────────────────────────────── 1. dates
{
    ok(isYmd('2026-02-28') && !isYmd('2026-02-30') && !isYmd('2026-2-3') && !isYmd(null), 'isYmd');
    eq([addDays('2026-02-27', 2), addDays('2028-02-28', 1), addDays('2026-01-01', -1)], ['2026-03-01', '2028-02-29', '2025-12-31'], 'addDays across month / leap / year');
    eq(daysBetween('2026-11-12', '2026-12-01'), 19, 'daysBetween');
    eq(todayYmd(new Date(2026, 10, 5, 23, 30)), '2026-11-05', 'todayYmd is local');
    throws(() => addDays('nope', 1), 'addDays refuses a bad date');
    eq(taskSpan(t('a', { startDate: '2026-11-10' })), { start: '2026-11-10', end: '2026-11-10' }, 'start only = one day');
    eq(taskSpan(t('a', { dueDate: '2026-11-10' })), { start: '2026-11-10', end: '2026-11-10' }, 'due only = one day');
    eq(taskSpan(t('a', { startDate: '2026-11-14', dueDate: '2026-11-10' })), { start: '2026-11-10', end: '2026-11-14' }, 'reversed days are put in order');
    eq(taskSpan(t('a', { startDate: '2026-11-01', dueDate: '2026-11-10', isMilestone: true })), { start: '2026-11-10', end: '2026-11-10' }, 'a milestone is its due day');
    eq(taskSpan(t('a')), null, 'no dates');
}

// ─────────────────────────────────────────────────────────────── 2. lists, overdue, progress, order
{
    const tasks = [
        t('late', { dueDate: '2026-11-10', sortOrder: 30 }),
        t('today', { startDate: '2026-11-10', dueDate: '2026-11-14', sortOrder: 20 }),
        t('due-today', { dueDate: TODAY, sortOrder: 40 }),
        t('soon', { startDate: '2026-11-15', dueDate: '2026-11-16' }),
        t('later', { dueDate: '2026-12-30' }),
        t('nodate'),
        t('done-late', { dueDate: '2026-11-01', status: 'done' }),
    ];
    eq(['late', 'today', 'due-today', 'soon', 'later', 'nodate', 'done-late'].map(id => taskWhen(tasks.find(x => x.id === id)!, TODAY)),
        ['overdue', 'today', 'today', 'upcoming', 'later', 'no_date', 'done'], 'taskWhen');
    const g = groupTasksByWhen(tasks, TODAY);
    eq(g.today.map(x => x.id), ['due-today', 'today'], 'today group by last day');
    eq([g.overdue.length, g.upcoming.length, g.later.length, g.no_date.length, g.done.length], [1, 1, 1, 1, 1], 'every task in one group');
    ok(isOverdue(tasks[0], TODAY) && !isOverdue(tasks[6], TODAY) && !isOverdue(tasks[2], TODAY), 'overdue: past and unfinished only');
    eq(overdueDays(tasks[0], TODAY), 2, 'overdue days');
    eq(taskWhen(tasks[3], TODAY, 2), 'later', 'upcoming window is configurable');
    const p = taskProgress([...tasks, t('ms', { isMilestone: true, status: 'done' })], TODAY);
    eq([p.total, p.done, p.open, p.overdue, p.milestones, p.milestonesDone, p.percent], [8, 2, 6, 1, 1, 1, 25], 'progress');
    eq(taskProgress([]).percent, 0, 'no tasks = 0%');
    eq(sortTasks([t('b', { sortOrder: 20 }), t('a', { sortOrder: 10 })]).map(x => x.id), ['a', 'b'], 'sortTasks');
    eq(nextSortOrder([t('a', { sortOrder: 40 }), t('b', { sortOrder: 10 })]), 50, 'nextSortOrder');
    eq(nextSortOrder([]), 10, 'first sort order');
    eq(reorderPatches(['b', 'a', 'c'], [t('a', { sortOrder: 10 }), t('b', { sortOrder: 20 }), t('c', { sortOrder: 30 })]),
        [{ id: 'b', sortOrder: 10 }, { id: 'a', sortOrder: 20 }], 'reorder: only changed tasks');
    ok(isTaskStatus('blocked') && !isTaskStatus('open'), 'isTaskStatus');
}

// ─────────────────────────────────────────────────────────────── 3. dependencies
{
    const tasks = [
        t('a'),
        t('b', { dependsOn: ['a'] }),
        t('c', { dependsOn: ['b'] }),
        t('x', { jobId: 'job-2' }),
    ];
    eq(validateDependencies(tasks, 'c', ['a', 'b', 'a']), { ok: true, dependsOn: ['a', 'b'] }, 'valid + deduped');
    eq((validateDependencies(tasks, 'a', ['a']) as any).error, 'self', 'self refused');
    eq((validateDependencies(tasks, 'a', ['zzz']) as any).error, 'unknown', 'unknown refused');
    eq((validateDependencies(tasks, 'a', ['x'], 'job-1') as any).error, 'other_job', 'other job refused');
    const cyc = validateDependencies(tasks, 'a', ['c']) as any;
    eq([cyc.error, cyc.cycle], ['cycle', ['a', 'c', 'b', 'a']], 'cycle refused with its path');
    eq((validateDependencies(tasks, 'a', Array.from({ length: 51 }, (_, i) => `n${i}`)) as any).error, 'too_many', 'too many refused');
    eq(wouldCreateCycle(tasks, 'new', ['c']), null, 'a new task can wait for anything');
    eq(findCycle(tasks), null, 'no loop');
    ok(findCycle([t('p', { dependsOn: ['q'] }), t('q', { dependsOn: ['p'] })])?.length === 3, 'loop found');
    eq(topologicalOrder([t('c', { dependsOn: ['b'], sortOrder: 1 }), t('b', { dependsOn: ['a'], sortOrder: 2 }), t('a', { sortOrder: 3 })]), ['a', 'b', 'c'], 'topological order');
    eq(topologicalOrder([t('p', { dependsOn: ['q'] }), t('q', { dependsOn: ['p'] }), t('z')]), ['z', 'p', 'q'], 'loops come last, nothing lost');
    eq(unfinishedDependencies(tasks[2], tasks).map(x => x.id), ['b'], 'unfinished dependencies');
    const doneA = tasks.map(x => (x.id === 'a' ? { ...x, status: 'done' as const } : x));
    ok(!isWaitingOnOthers(doneA[1], doneA) && isWaitingOnOthers(doneA[2], doneA), 'waiting');
    eq([displayStatus(doneA[1], doneA), displayStatus(doneA[2], doneA), displayStatus({ ...doneA[2], status: 'done' }, doneA)], ['todo', 'blocked', 'done'], 'displayStatus');
    eq(directDependents(tasks, 'a').map(x => x.id), ['b'], 'direct dependents');
    eq(allDependents(tasks, 'a').map(x => x.id), ['b', 'c'], 'all dependents in order');
}

// ─────────────────────────────────────────────────────────────── 4. moving dates
{
    const tasks = [
        t('a', { startDate: '2026-11-12', dueDate: '2026-11-13' }),
        t('b', { startDate: '2026-11-14', dueDate: '2026-11-15', dependsOn: ['a'] }),
        t('c', { dueDate: '2026-11-20', dependsOn: ['b'] }),
        t('d', { dependsOn: ['b'] }),
        t('e', { startDate: '2026-11-16', dueDate: '2026-11-16', dependsOn: ['c'], status: 'done' }),
    ];
    eq(shiftDependents(tasks, 'a', 3), [
        { id: 'b', startDate: '2026-11-17', dueDate: '2026-11-18' },
        { id: 'c', startDate: null, dueDate: '2026-11-23' },
    ], 'shift: dated, unfinished dependents by the same days');
    eq(shiftDependents(tasks, 'a', 0), [], 'no move, no change');
    const moved = tasks.map(x => (x.id === 'a' ? { ...x, dueDate: '2026-11-16' } : x));
    eq(pushDependents(moved), [{ id: 'b', startDate: '2026-11-17', dueDate: '2026-11-18' }], 'push: only as far as needed (c already later)');
    const ms = [t('m', { dueDate: '2026-11-20', isMilestone: true }), t('n', { startDate: '2026-11-19', dueDate: '2026-11-19', dependsOn: ['m'] })];
    eq(pushDependents(ms), [{ id: 'n', startDate: '2026-11-20', dueDate: '2026-11-20' }], 'after a milestone: same day');
    eq(pushDependents(tasks), [], 'nothing to push');
}

// ─────────────────────────────────────────────────────────────── 5. timeline + critical path
{
    const tasks = [
        t('a', { startDate: '2026-11-12', dueDate: '2026-11-14', sortOrder: 10 }),
        t('b', { startDate: '2026-11-15', dueDate: '2026-11-20', dependsOn: ['a'], sortOrder: 20 }),
        t('m', { dueDate: '2026-11-21', isMilestone: true, dependsOn: ['b'], sortOrder: 30 }),
        t('side', { startDate: '2026-11-12', dueDate: '2026-11-13', sortOrder: 40 }),
        t('old', { startDate: '2026-11-01', dueDate: '2026-11-11', sortOrder: 5 }),
        t('nodate', { sortOrder: 50 }),
    ];
    eq(criticalPath(tasks), ['a', 'b', 'm'], 'critical path = longest chain');
    eq(criticalPath([t('x', { startDate: '2026-11-01', dueDate: '2026-11-30' }), t('y')]), [], 'no chain, no critical path');
    const w = timelineWindow(tasks, TODAY, { padDays: 1 });
    eq(w, { start: '2026-10-31', end: '2026-11-22', days: 23 }, 'window covers every task + padding');
    eq(timelineWindow([], TODAY, { padDays: 0, minDays: 7 }), { start: TODAY, end: '2026-11-18', days: 7 }, 'empty: today, min length');
    eq(timelineWindow([t('far', { dueDate: '2030-01-01' })], TODAY, { maxDays: 30 }).days, 30, 'max length');
    const small = { start: '2026-11-12', end: '2026-11-18', days: 7 };
    const lay = layoutTimeline(tasks, small, TODAY);
    eq(lay.bars.map(b => [b.id, b.row, b.offset, b.length]), [['a', 0, 0, 3], ['b', 1, 3, 4], ['side', 2, 0, 2]], 'rows, offsets, lengths (clipped)');
    eq([lay.bars[1].clippedEnd, lay.bars[0].clippedStart], [true, false], 'clipping flags');
    eq(lay.outside.sort(), ['m', 'old'], 'outside the window');
    eq(lay.unscheduled, ['nodate'], 'unscheduled');
    eq(lay.links, [{ from: 'a', to: 'b' }], 'links only between bars on the chart');
    eq(lay.todayOffset, 0, 'today line');
    ok(lay.bars[0].critical && lay.bars[1].critical && !lay.bars[2].critical, 'critical flags');
    ok(lay.bars[1].waiting && !lay.bars[0].waiting, 'waiting flag');
    const full = layoutTimeline(tasks, w, TODAY);
    const m = full.bars.find(b => b.id === 'm')!;
    eq([m.isMilestone, m.length, m.offset], [true, 0, 21], 'milestone marker');
    ok(full.bars.find(b => b.id === 'old')!.overdue, 'overdue bar');
    eq(layoutTimeline(tasks, { start: '2026-12-01', end: '2026-12-07', days: 7 }, TODAY).todayOffset, null, 'today outside the window');
}

// ─────────────────────────────────────────────────────────────── 6. proposals + templates
{
    seq = 0;
    const proposals: ProposedTask[] = [
        { title: 'A', notes: null, startDate: null, dueDate: '2026-11-13', isMilestone: false, crewMemberId: 'm-1', assigneeName: 'Mike', dependsOnIndex: [], source: 'ai', workOrderDocId: null },
        { title: 'B', notes: 'n', startDate: null, dueDate: null, isMilestone: true, crewMemberId: null, assigneeName: null, dependsOnIndex: [0, 0, 1, 7], source: 'ai', workOrderDocId: null },
    ];
    const drafts = proposalsToDrafts(proposals, newId, { sortStart: 100 });
    eq(drafts.map(d => [d.id, d.dependsOn, d.sortOrder, d.source, d.status]), [['id-1', [], 100, 'ai', 'todo'], ['id-2', ['id-1'], 110, 'ai', 'todo']], 'proposals -> drafts (deps to earlier ids only)');

    seq = 0;
    const starter = STARTER_TASK_TEMPLATES[0];
    const inst = instantiateTemplate(starter, '2026-11-16', newId);
    eq(inst.length, starter.items.length, 'every template item');
    eq([inst[0].startDate, inst[0].dueDate, inst[1].startDate, inst[1].dueDate], ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'], 'offsets + durations');
    eq([inst[3].isMilestone, inst[3].startDate, inst[3].dueDate, inst[3].dependsOn], [true, '2026-11-20', '2026-11-20', ['id-2', 'id-3']], 'milestone + dependencies');
    ok(inst.every(d => d.source === 'template'), 'source template');
    eq(findCycle(inst.map((d, i) => t(d.id!, { dependsOn: d.dependsOn, sortOrder: i }))), null, 'starter has no loop');
    throws(() => instantiateTemplate(starter, 'tomorrow', newId), 'needs a real start date');
    for (const s of STARTER_TASK_TEMPLATES) eq(parseTaskTemplates({ templates: [s] }), [s], `starter "${s.name}" survives parsing`);

    const parsed = parseTaskTemplates({ version: 1, templates: [
        { id: 't1', name: '  Kitchen  ', updatedAt: 'x', items: [
            { title: 'Demo', offsetDays: -3, durationDays: 0 },
            { title: '' },
            { title: 'Cabinets', offsetDays: '2', durationDays: 3, dependsOn: [0, 1, 2, 9] },
            { title: 'Walkthrough', offsetDays: 5, durationDays: 4, isMilestone: true, dependsOn: [2] },
        ] },
        { id: 't1', name: 'dup id', items: [{ title: 'x' }] },
        { id: 't2', name: 'empty', items: [] },
        'junk',
    ] });
    eq(parsed.length, 1, 'bad / duplicate / empty templates dropped');
    eq(parsed[0].items, [
        { title: 'Demo', offsetDays: 0, durationDays: 1 },
        { title: 'Cabinets', offsetDays: 2, durationDays: 3, dependsOn: [0] },
        { title: 'Walkthrough', offsetDays: 5, durationDays: 0, isMilestone: true, dependsOn: [1] },
    ], 'items clamped; dependencies remapped after a dropped item');
    eq(parsed[0].name, 'Kitchen', 'name trimmed');
    eq(parseTaskTemplates(null), [], 'nothing stored');
    const many: TaskTemplate[] = Array.from({ length: TEMPLATE_LIMITS.templates + 1 }, (_, i) => ({ id: `t${i}`, name: `T${i}`, updatedAt: '', items: [{ title: 'x', offsetDays: 0, durationDays: 1 }] }));
    ok(serializeTaskTemplates(many).error, 'too many templates refused');
    const huge: TaskTemplate = { id: 'h', name: 'H', updatedAt: '', items: Array.from({ length: 60 }, (_, i) => ({ title: `${'Long task name '.repeat(12)}${i}`, notes: 'n'.repeat(400), offsetDays: i, durationDays: 1 })) };
    ok(/too long/.test(serializeTaskTemplates([huge]).error || ''), 'too big refused');
    const good = serializeTaskTemplates([starter]);
    eq([good.error, good.value.version, good.value.templates.length], [null, 1, 1], 'serialize ok');
    ok(JSON.stringify(good.value).length < TEMPLATE_LIMITS.jsonChars, 'under the user_settings limit');

    seq = 0;
    const back = templateFromTasks('Mine', [
        { ...t('b', { startDate: '2026-11-14', dueDate: '2026-11-15', dependsOn: ['a'] }), title: 'B', notes: 'nb' },
        { ...t('a', { startDate: '2026-11-12', dueDate: '2026-11-12' }), title: 'A' },
        { ...t('m', { dueDate: '2026-11-16', isMilestone: true, dependsOn: ['b'] }), title: 'M' },
        { ...t('u'), title: 'U' },
    ], newId, new Date('2026-11-12T00:00:00Z'));
    eq(back.items, [
        { title: 'A', offsetDays: 0, durationDays: 1 },
        { title: 'B', offsetDays: 2, durationDays: 2, notes: 'nb', dependsOn: [0] },
        { title: 'M', offsetDays: 4, durationDays: 0, isMilestone: true, dependsOn: [1] },
        { title: 'U', offsetDays: 0, durationDays: 1 },
    ], 'save tasks as a template (dependency order, offsets from the first day)');
    seq = 0;
    eq(instantiateTemplate(back, '2026-11-12', newId).map(d => [d.startDate, d.dueDate]), [
        ['2026-11-12', '2026-11-12'], ['2026-11-14', '2026-11-15'], ['2026-11-16', '2026-11-16'], ['2026-11-12', '2026-11-12'],
    ], 'template round trip keeps the schedule');
    eq(TASK_TEMPLATES_SETTING, 'tasks.templates', 'templates key');
    ok(readFileSync(join(root, 'lib/userData.ts'), 'utf8').includes("TASK_TEMPLATES_KEY = 'tasks.templates'"), 'lib/userData.ts uses the same key');
}

// ─────────────────────────────────────────────────────────────── 7. rows + crew link answers
{
    const row = {
        id: 't1', user_id: 'u', job_id: 'j', title: 'Tile', notes: '', status: 'weird', crew_member_id: null, start_date: '2026-11-12T00:00:00',
        due_date: 'bad', is_milestone: true, depends_on: ['a', null], sort_order: '20', completed_at: null, completed_photo_path: 'u/m/task-1.jpg',
        source: 'nope', work_order_doc_id: 'wo', created_at: 'c', updated_at: 'u2',
    };
    const task = mapTaskRow(row);
    eq([task.status, task.startDate, task.dueDate, task.notes, task.dependsOn, task.sortOrder, task.source, task.completedPhotoPath],
        ['todo', '2026-11-12', null, null, ['a'], 20, 'manual', 'u/m/task-1.jpg'], 'row mapping is tolerant');
    for (const k of ['id', 'user_id', 'job_id', 'title', 'notes', 'status', 'crew_member_id', 'start_date', 'due_date', 'is_milestone', 'depends_on', 'sort_order',
        'completed_at', 'completed_photo_path', 'source', 'work_order_doc_id', 'created_at', 'updated_at']) ok(TASK_COLUMNS.split(', ').includes(k), `column ${k} selected`);
    const ins = taskInsertRow({ id: 'n1', title: '  Hang\n doors ', startDate: '2026-11-20', dueDate: '2026-11-18', source: 'template', dependsOn: ['a', 'a'] }, 'u', 'j');
    eq([ins.id, ins.title, ins.start_date, ins.due_date, ins.source, ins.status, ins.depends_on, ins.user_id, ins.job_id, ins.notes, ins.is_milestone],
        ['n1', 'Hang doors', '2026-11-18', '2026-11-20', 'template', 'todo', ['a'], 'u', 'j', null, false], 'insert row');
    throws(() => taskInsertRow({ title: '   ' }, 'u', 'j'), 'empty title refused');
    eq(taskPatchRow({ status: 'done' }), { status: 'done' }, 'patch: only keys present');
    eq(taskPatchRow({ crewMemberId: '', dueDate: null, notes: '  x  ' }), { crew_member_id: null, due_date: null, notes: 'x' }, 'patch clears');
    ok(!('completed_photo_path' in taskPatchRow({ title: 'x' } as any)) && !('source' in taskPatchRow({ source: 'ai' } as any)), 'patch never writes the photo or the source');
    eq(mapCommentRow({ id: 'c', task_id: 't', body: 'hi', author_kind: 'crew', author_name: 'Mike', created_at: 'x' }).authorKind, 'crew', 'comment row');

    const view = mapCrewTasksView(JSON.stringify({ server_now: 'now', tasks: [
        { id: 't1', job_id: 'j', job_name: 'Kitchen', job_address: '1 Main', title: 'Tile', status: 'doing', due_date: '2026-11-13', is_milestone: false, has_photo: true, waiting_on: 2,
            comments: [{ id: 'c1', body: 'Grout?', author_kind: 'owner', author_name: null, created_at: 'x' }] },
        { id: '', title: 'no id' },
    ] }));
    eq([view.tasks.length, view.tasks[0].status, view.tasks[0].hasPhoto, view.tasks[0].waitingOn, view.tasks[0].comments[0].body], [1, 'doing', true, 2, 'Grout?'], 'crew tasks answer');
    eq(mapCrewTaskUpdate({ task: { id: 't1', status: 'done', completed_at: 'x', has_photo: false }, upload_path: 'u/m/task-z.jpg' }),
        { id: 't1', status: 'done', completedAt: 'x', hasPhoto: false, uploadPath: 'u/m/task-z.jpg' }, 'crew update answer');
    eq(mapCrewTaskUpdate({}), null, 'no task, no result');
    eq([crewAnswerError({ error: 'invalid_link' }), crewAnswerError({ error: 'paused' }), crewAnswerError({ tasks: [] })], ['invalid_link', 'paused', null], 'crew link errors');
}

// ─────────────────────────────────────────────────────────────── 8. work orders
{
    const crew = [{ id: 'm-1', name: 'Mike Diaz' }, { id: 'm-2', name: 'Ana Lopez' }];
    const wo = { id: 'doc-1', type: 'Work Order', data: {
        title: 'Bathroom', workOrderNumber: 'WO-7', date: '2026-11-14', assignedTo: 'mike',
        description: '<ul><li>Remove old vanity</li><li>1. Install new vanity &amp; faucet</li><li>Remove old vanity</li></ul><p>- Caulk tub</p>',
        materialsUsed: 'Vanity\nFaucet',
    } };
    const p = workOrderToProposedTasks(wo, { crew, existingTitles: ['caulk tub'] });
    eq(p.map(x => x.title), ['Get materials', 'Remove old vanity', 'Install new vanity & faucet'], 'one task per line (HTML list, numbers, bullets), duplicates and existing skipped');
    eq(p.map(x => x.dependsOnIndex), [[], [0], [0]], 'work waits for the materials');
    ok(p.every(x => x.source === 'work_order' && x.workOrderDocId === 'doc-1' && x.crewMemberId === 'm-1' && x.assigneeName === 'Mike Diaz' && x.startDate === '2026-11-14'), 'source, link, assignee, start date');
    ok(/Vanity\nFaucet/.test(p[0].notes || '') && /From work order WO-7/.test(p[1].notes || ''), 'notes: materials + where it came from');
    const one = workOrderToProposedTasks({ id: 'd2', data: { title: 'Fix leak', workOrderNumber: '8', description: 'Leak under the kitchen sink, replace the trap.', assignedTo: 'Bob' } }, { crew });
    eq([one.length, one[0].title, one[0].crewMemberId, one[0].assigneeName, one[0].startDate], [1, 'Fix leak #8', null, 'Bob', null], 'a paragraph = one task named after the work order');
    eq(workOrderToProposedTasks({ id: 'd3', data: {} }).map(x => x.title), ['Work order'], 'empty work order still gives one task');
    eq(workOrderToProposedTasks({ id: 'd4', data: { materialsUsed: 'Paint' } }, { includeMaterials: false }).map(x => x.title), ['Work order'], 'materials task can be left out');
    const long = workOrderToProposedTasks({ id: 'd5', data: { description: `- ${'word '.repeat(40)}\n- short` } });
    ok(long[0].title.endsWith('…') && long[0].title.length <= 121 && (long[0].notes || '').startsWith('word word'), 'long line: short title, full text in notes');
    eq(textLines('a<br>b<br/>&nbsp;c'), ['a', 'b', 'c'], 'HTML lines');
    ok(isWorkOrderDocument({ type: 'Work Order' }) && !isWorkOrderDocument({ type: 'Invoice' }), 'work order type');
    const linked = [{ ...t('a', { status: 'done' }), workOrderDocId: 'doc-1' }, { ...t('b'), workOrderDocId: 'doc-1' }, { ...t('c'), workOrderDocId: null }];
    eq(tasksForWorkOrder(linked, 'doc-1').map(x => x.id), ['a', 'b'], 'tasks of a work order');
    eq(workOrderTaskProgress(linked, 'doc-1')?.percent, 50, 'work order progress');
    eq(workOrderTaskProgress(linked, 'doc-9'), null, 'no tasks, no progress');
    ok(readFileSync(join(root, 'types.ts'), 'utf8').includes('WorkOrder = "Work Order"'), 'FormType.WorkOrder string matches');
}

// ─────────────────────────────────────────────────────────────── 9. AI extraction (validation, no model)
{
    const R = (s: string) => resolveDueText(s, TODAY);
    eq([R('today'), R('tomorrow'), R('day after tomorrow'), R('in 3 days'), R('in two weeks'), R('in a week'), R('in 1 month'), R('3 days from now')],
        ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-26', '2026-11-19', '2026-12-12', '2026-11-15'], 'relative phrases');
    eq([R('Friday'), R('by friday'), R('Thursday'), R('next week'), R('end of week'), R('end of the month')],
        ['2026-11-13', '2026-11-13', '2026-11-19', '2026-11-16', '2026-11-13', '2026-11-30'], 'weekdays and ends');
    eq([R('2026-12-01'), R('11/20'), R('1/5'), R('Nov 20'), R('20 November'), R('the 20th'), R('the 3rd'), R('12/24/2027')],
        ['2026-12-01', '2026-11-20', '2027-01-05', '2026-11-20', '2026-11-20', '2026-11-20', '2026-12-03', '2027-12-24'], 'absolute dates');
    eq([R('soon'), R(''), R('2026-02-30'), resolveDueText('tomorrow', 'bad')], [null, null, null, null], 'unreadable -> null');
    eq(resolveDueText('in 1 month', '2026-01-31'), '2026-02-28', 'month end clamp');

    const crew = [{ id: 'm-1', name: 'Mike Diaz' }, { id: 'm-2', name: 'Mike Brown' }, { id: 'm-3', name: 'José Ruiz' }, { id: 'm-4', name: 'Ana Lopez' }];
    eq([matchCrewName('Mike Diaz', crew)?.id, matchCrewName('mike', crew), matchCrewName('jose', crew)?.id, matchCrewName('Lopez', crew)?.id, matchCrewName('Bob', crew), matchCrewName('', crew)],
        ['m-1', null, 'm-3', 'm-4', null, null], 'crew names: full, ambiguous, accents, last name, unknown');

    const req = sanitizeExtractTasksRequest({ task: 'extract_tasks', text: '<p>Order tile</p>', source_kind: 'weird', context: { today: TODAY, crew: [...crew, { id: '', name: 'x' }, { id: 'm-1', name: 'dup' }], existing_titles: ['Old task'] } });
    eq([req.text, req.source_kind, req.context.crew.length, req.context.existing_titles], ['Order tile', 'text', 4, ['Old task']], 'request cleaned');
    throws(() => sanitizeExtractTasksRequest({ task: 'extract_tasks', text: '  ' }), 'empty text refused');
    throws(() => sanitizeExtractTasksRequest({ task: 'extract_tasks', text: 'x'.repeat(6001) }), 'long text refused');
    ok(isExtractTasksBody({ task: 'extract_tasks' }) && !isExtractTasksBody({ task: 'photo_update' }) && !isExtractTasksBody({ message: 'x' }), 'task body detection');
    const out = normalizeExtractedTasks({ tasks: [
        { title: '- Order tile', due: 'tomorrow', assignee: 'Ana', notes: 'Order tile', depends_on: [] },
        { title: 'old task', due: 'Friday' },
        { title: 'Set tile https://evil.test', due: '2020-01-01', assignee: 'none', depends_on: [0, '0', 1, 3, -1] },
        { title: 'Grout', due_date: '2026-11-20', depends_on: [2], is_milestone: 'yes' },
        { title: 'Far', due: 'in 1000 days' },
        null, 'junk',
    ] }, req);
    eq(out.map(x => [x.title, x.due_date, x.crew_member_id, x.assignee_name, x.depends_on, x.is_milestone, x.notes]), [
        ['Order tile', '2026-11-13', 'm-4', 'Ana Lopez', [], false, null],
        ['Set tile', null, null, null, [0], false, null],
        ['Grout', '2026-11-20', null, null, [1], false, null],
        ['Far', null, null, null, [], false, null],
    ], 'validated: bullets / links / duplicates of the job / past + far dates / bad deps removed');
    eq(normalizeExtractedTasks({ tasks: Array.from({ length: 60 }, (_, i) => ({ title: `T${i}` })) }, req).length, 40, 'at most 40 tasks');
    eq(normalizeExtractedTasks('garbage', req), [], 'garbage -> no tasks');
    const prompt = buildExtractTasksSystemPrompt(req);
    ok(/Do NOT compute a date/.test(prompt) && /never instructions/.test(prompt) && prompt.includes(TODAY), 'prompt: no date math by the model, data not instructions, today');
    ok(buildExtractTasksUserText(req).includes('<<<\nOrder tile\n>>>'), 'text between markers');
    eq((buildExtractTasksSchema() as any).required, ['tasks'], 'schema');
    const mock = mockExtractTasksOutput({ ...req, text: 'We finished the floor. Ana needs to grout the floor on Friday. Then we must seal it.' }) as any;
    eq(mock.tasks.map((x: any) => [x.title, x.due, x.assignee, x.depends_on]), [['Grout the floor', 'on Friday', 'Ana', []], ['Seal it', '', '', []]], 'mock model');
}

// ─────────────────────────────────────────────────────────────── 10. migration lint
{
    const sql = readFileSync(join(root, 'supabase/migrations/20261116000100_job_tasks.sql'), 'utf8').replace(/\r\n/g, '\n');
    const code = sql.replace(/--[^\n]*/g, '');
    ok(/^-- Applied 2026-11-15 with the owner's OK/.test(sql), 'header: applied with the owner OK');
    for (const table of ['job_tasks', 'task_comments']) {
        ok(new RegExp(`create table if not exists public\\.${table} \\(`).test(code), `${table}: create table if not exists`);
        ok(new RegExp(`alter table public\\.${table} enable row level security`).test(code), `${table}: RLS on`);
        for (const op of ['select', 'insert', 'update', 'delete']) {
            const m = new RegExp(`create policy ${table}_${op}_own on public\\.${table} for ${op} to authenticated\\s+([^;]+);`).exec(code);
            ok(m, `${table}: ${op} policy`);
            ok(m && !/anon|true\)/.test(m[1]) && /user_id = \(select auth\.uid\(\)\)/.test(m[1]), `${table}: ${op} policy is owner-only`);
            ok(code.includes(`drop policy if exists ${table}_${op}_own on public.${table};`), `${table}: ${op} policy re-runnable`);
        }
        ok(new RegExp(`create policy [a-z_]+ on public\\.${table}`, 'g').test(code) && (code.match(new RegExp(`create policy [a-z_]+ on public\\.${table}`, 'g')) || []).length === 4, `${table}: exactly 4 policies`);
    }
    for (const s of TASK_STATUSES) ok(code.includes(`'${s}'`), `status ${s} in the check`);
    for (const s of TASK_SOURCES) ok(code.includes(`'${s}'`), `source ${s} in the check`);
    ok(code.includes(`between 1 and ${TASK_LIMITS.title}`) && code.includes(`<= ${TASK_LIMITS.notes}`) && code.includes(`cardinality(depends_on) <= ${TASK_LIMITS.dependsOn}`)
        && code.includes(`>= ${TASK_LIMITS.perJob}`) && code.includes(`between 1 and ${TASK_LIMITS.comment}`) && code.includes(`>= ${TASK_LIMITS.commentsPerTask}`), 'limits match taskTypes.ts');
    ok(/idx_job_tasks_user_job on public\.job_tasks \(user_id, job_id\)/.test(code) && /\(user_id, due_date\) where status <> 'done'/.test(code), 'required indexes');

    const fns = [...code.matchAll(/create or replace function (public\.[a-z_]+)\(([^)]*)\)([\s\S]*?)\n\$\$;/g)];
    eq(fns.map(f => f[1]).sort(), ['public.can_upload_crew_task_photo', 'public.cleanup_job_task_deps', 'public.crew_task_update', 'public.crew_tasks_get', 'public.guard_job_task', 'public.guard_task_comment'], 'the six functions');
    for (const f of fns) {
        const head = f[3].split(/\nas \$\$/)[0];
        ok(/\bsecurity definer\b/.test(head), `${f[1]}: security definer`);
        ok(/set search_path = ''/.test(head), `${f[1]}: search_path = ''`);
        ok(/\nas \$\$\n/.test(f[3]), `${f[1]}: body opens with "as $$"`);
        const body = f[3].split(/\nas \$\$\n/)[1] || '';
        // table references (FROM / JOIN / INSERT INTO / UPDATE), not "is distinct from x" or "select ... into v_x"
        const unqualified = body.match(/(?<!distinct )\b(?:from|join|insert into|update)\s+(?!public\.|storage\.|lateral\b|walk\b|unnest\b|\()([a-z_]+)\b/g);
        ok(!unqualified, `${f[1]}: tables schema-qualified ${unqualified ? JSON.stringify(unqualified) : ''}`);
    }
    eq((code.match(/\bas \$\$/g) || []).length, fns.length, 'every function body opens with "as $$"');
    ok(!/\bdrop\s+(table|schema|column|function|view|index|bucket)\b/i.test(code), 'no DROP of tables / functions');
    ok(!/^\s*truncate\b/im.test(code) &&!/\bdelete\s+from\b/i.test(code) && !/alter table [^;]*\b(drop|rename|alter column)\b/i.test(code), 'no destructive statement');
    ok(!/\bupdate\s+(?!public\.job_tasks\b)public\.(?!crew_members\b)[a-z_]+/i.test(code), 'updates only the new table (and crew last seen)');
    const anonGrants = [...code.matchAll(/grant ([^;]+?) to ([^;]+);/g)].filter(g => /\banon\b/.test(g[2])).map(g => g[1].replace(/\s+/g, ' ').trim());
    eq(anonGrants.sort(), [
        'execute on function public.can_upload_crew_task_photo(text)',
        'execute on function public.crew_task_update(text, uuid, text, text, text)',
        'execute on function public.crew_tasks_get(text)',
    ], 'anon gets only the crew link functions');
    ok(/revoke all on public\.job_tasks, public\.task_comments from anon/.test(code), 'tables revoked from anon');
    for (const f of fns) ok(code.includes(`revoke all on function ${f[1]}(`), `${f[1]}: revoked by default`);
    ok(/drop trigger if exists trg_job_tasks_guard[\s\S]*create trigger trg_job_tasks_guard/.test(code) && /drop trigger if exists tr_job_tasks_updated_at/.test(code)
        && /drop trigger if exists trg_task_comments_guard/.test(code) && /drop trigger if exists trg_job_tasks_cleanup_deps/.test(code), 'triggers re-runnable');
    ok(/drop policy if exists cd_crew_task_photos_insert_public on storage\.objects;\s*create policy cd_crew_task_photos_insert_public/.test(code), 'storage policy re-runnable');
    ok(/task_id\s+uuid not null references public\.job_tasks\(id\) on delete cascade/.test(code), 'comments cascade with their task');
    // worker writes: only status / photo / comment
    const upd = /create or replace function public\.crew_task_update[\s\S]*?\n\$\$;/.exec(code)![0];
    const sets = /set status = coalesce\(v_status, status\),\s*completed_photo_path = coalesce\(v_path, completed_photo_path\)\s*where id = v_task\.id/.test(upd);
    ok(sets && (upd.match(/update public\.job_tasks/g) || []).length === 1, 'crew update changes only status + photo');
    ok(/t\.crew_member_id = v_m\.id/.test(upd) && /v_status not in \('doing', 'done'\)/.test(upd), 'only their own tasks, only doing / done');
    ok(/_crew_member_id\(p_token\)/.test(upd) && /_crew_rate_guard/.test(upd) && /'paused'/.test(upd), 'crew link checks (signature, rate limit, plan)');
    const get = /create or replace function public\.crew_tasks_get[\s\S]*?\n\$\$;/.exec(code)![0];
    ok(/t\.crew_member_id = v_m\.id/.test(get) && !/price|rate|phone|email|cost/i.test(get.replace(/_crew_rate_guard|crew_rate_events/g, '')), 'worker sees only their tasks, no prices / contacts');
    ok(/if new\.id = any\(new\.depends_on\)/.test(code) && /t\.job_id <> new\.job_id or t\.user_id <> new\.user_id/.test(code) && /with recursive walk/.test(code), 'guard: self, other job, cycle');
    ok(/OLD is only read inside the UPDATE branch/.test(sql) && !/tg_op = 'INSERT' or new\.depends_on is distinct from old\./.test(code), 'OLD not read on insert');
}

console.log(`job-tasks-check: ${checks} checks passed`);
