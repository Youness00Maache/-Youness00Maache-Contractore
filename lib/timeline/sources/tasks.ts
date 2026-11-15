/**
 * Timeline source: job tasks (lib/tasks). Tasks added (a template or an AI list adds many in one go: those become one
 * entry) and tasks finished. Team group. Pure.
 */
import type { JobTask } from '../../tasks/taskTypes.ts';
import { countWord, isoOf, makeEvent, plainText, safely } from '../timelineHelpers.ts';
import { shortDate } from '../timelineFormat.ts';
import type { TimelineContext, TimelineEvent } from '../timelineTypes.ts';

const minute = (iso: string): string => iso.slice(0, 16);
const SOURCE_WORD: Record<string, string> = { ai: 'from a note', work_order: 'from a work order', template: 'from a template', manual: '' };

export const taskEvents = ({ tasks }: { tasks: readonly JobTask[] }, ctx: TimelineContext): TimelineEvent[] => safely(() => {
    const out: TimelineEvent[] = [];
    const link = { type: 'tab' as const, tab: 'tasks' as const };
    const nameOf = (t: JobTask): string => (t.crewMemberId && ctx.memberNames?.[t.crewMemberId]) || '';
    const year = Number(new Date(ctx.now).toISOString().slice(0, 4)) || undefined;

    const added = new Map<string, Array<{ task: JobTask; at: string }>>();
    for (const task of tasks) {
        const at = isoOf(task.createdAt);
        if (!at) continue;
        const key = `${minute(at)}|${task.source}`;
        added.set(key, [...(added.get(key) || []), { task, at }]);
    }
    for (const [key, list] of added) {
        const at = list.map(x => x.at).sort().pop() as string;
        if (list.length === 1) {
            const { task } = list[0];
            out.push(makeEvent({ id: `task:${task.id}:added`, at, kind: 'task_added', source: 'tasks', title: `Task added: ${plainText(task.title, 90)}`, detail: [nameOf(task) && `For ${nameOf(task)}`, task.dueDate && `due ${shortDate(task.dueDate, year)}`].filter(Boolean).join(' · ') || undefined, actor: 'you', link }));
        } else {
            const via = SOURCE_WORD[list[0].task.source] || '';
            out.push(makeEvent({
                id: `task:added:${key}`, at, kind: 'task_added', source: 'tasks', title: `${countWord(list.length, 'task')} added${via ? ` ${via}` : ''}`,
                detail: list.slice(0, 3).map(x => plainText(x.task.title, 36)).join(' · ') + (list.length > 3 ? ` and ${list.length - 3} more` : ''),
                rows: list.slice(0, 12).map(x => ({ label: 'Task', value: plainText(x.task.title, 90) })), actor: 'you', link,
            }));
        }
    }

    for (const task of tasks) {
        if (task.status !== 'done') continue;
        const at = isoOf(task.completedAt);
        if (!at) continue;
        const byCrew = !!task.completedPhotoPath;
        out.push(makeEvent({
            id: `task:${task.id}:done`, at, kind: 'task_done', source: 'tasks', title: `Task done: ${plainText(task.title, 90)}`,
            detail: [nameOf(task) && `By ${nameOf(task)}`, byCrew && 'with a photo'].filter(Boolean).join(' · ') || undefined, actor: byCrew ? 'crew' : 'you', link,
        }));
    }
    return out;
});
