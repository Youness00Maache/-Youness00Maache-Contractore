/**
 * The account's open tasks on the Schedule (components/CalendarView.tsx): a hook that reads them (listOpenTasks) and
 * the small pieces the calendar draws with them. Every piece opens the job's Tasks tab. Nothing here changes the
 * calendar's own job bars; without the feature (or offline) the hook returns nothing and the calendar looks as before.
 *   useScheduleTasks(enabled)   { list, loaded }  open tasks that have a date (soonest first)
 *   TaskDayList                 "Tasks" under the selected day (month view)
 *   TaskChips                   one day column of the week view
 *   TaskAgenda                  the list view: late tasks, then the month's tasks by due day
 */
import React, { useEffect, useState } from 'react';
import { listOpenTasks } from '../../lib/tasks/tasksApi.ts';
import { markTasksMissing } from '../../lib/tasks/taskFeature.ts';
import { todayYmd } from '../../lib/tasks/taskLogic.ts';
import { scheduleAgenda, scheduleTasks, shortDay, type ScheduleTask } from '../../lib/tasks/taskView.ts';
import { Diamond, cx } from './taskUi.tsx';

export function useScheduleTasks(enabled: boolean): { list: ScheduleTask[]; loaded: boolean } {
    const [list, setList] = useState<ScheduleTask[]>([]);
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
        if (!enabled) { setList([]); setLoaded(false); return; }
        let alive = true;
        const load = async () => {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
            try {
                const rows = await listOpenTasks({ limit: 1000 });
                if (!alive) return;
                if (rows === null) { markTasksMissing(); setList([]); } else setList(scheduleTasks(rows, todayYmd()));
                setLoaded(true);
            } catch {
                // keep what is shown; the calendar works without tasks
            }
        };
        void load();
        const onOnline = () => { void load(); };
        window.addEventListener('online', onOnline);
        return () => { alive = false; window.removeEventListener('online', onOnline); };
    }, [enabled]);
    return { list, loaded };
}

const span = (t: ScheduleTask, year: number): string =>
    t.start === t.end ? shortDay(t.end, 'en', year) : `${shortDay(t.start, 'en', year)} to ${shortDay(t.end, 'en', year)}`;

const TaskRow: React.FC<{ task: ScheduleTask; jobName: string; onOpen: (jobId: string) => void; year: number }> = ({ task, jobName, onOpen, year }) => (
    <button
        type="button"
        onClick={() => onOpen(task.jobId)}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/40"
        aria-label={`Open tasks of ${jobName}: ${task.title}`}
    >
        <span className={cx('shrink-0', task.overdue ? 'text-destructive' : 'text-foreground/70')}>
            {task.isMilestone ? <Diamond /> : <span className="block h-2.5 w-2.5 rounded-full border-2 border-current" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{task.title}</span>
            <span className="block text-xs text-muted-foreground">{jobName || 'Job'} · <span className={task.overdue ? 'font-semibold text-destructive' : ''}>{task.overdue ? `late, was due ${shortDay(task.end, 'en', year)}` : span(task, year)}</span></span>
        </span>
    </button>
);

/** Tasks that run on the selected day. */
export const TaskDayList: React.FC<{ tasks: readonly ScheduleTask[]; jobNames: ReadonlyMap<string, string>; onOpen: (jobId: string) => void }> = ({ tasks, jobNames, onOpen }) => {
    if (!tasks.length) return null;
    const year = new Date().getFullYear();
    return (
        <div className="mt-4 border-t border-border pt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tasks <span className="normal-case tracking-normal">· {tasks.length}</span></h3>
            <div className="space-y-1.5">
                {tasks.slice(0, 12).map(t => <TaskRow key={t.id} task={t} jobName={jobNames.get(t.jobId) || ''} onOpen={onOpen} year={year} />)}
                {tasks.length > 12 && <p className="px-1 text-xs text-muted-foreground">and {tasks.length - 12} more in the jobs’ Tasks tabs.</p>}
            </div>
        </div>
    );
};

/** Small outlined chips under a day's jobs in the week view. */
export const TaskChips: React.FC<{ tasks: readonly ScheduleTask[]; jobNames: ReadonlyMap<string, string>; onOpen: (jobId: string) => void }> = ({ tasks, jobNames, onOpen }) => {
    if (!tasks.length) return null;
    return (
        <div className="mt-1.5 space-y-1 border-t border-dashed border-border pt-1.5">
            {tasks.slice(0, 4).map(t => (
                <button
                    key={t.id}
                    type="button"
                    onClick={() => onOpen(t.jobId)}
                    title={`${t.title} (${jobNames.get(t.jobId) || 'Job'})${t.overdue ? ', late' : ''}`}
                    className={cx('flex w-full items-center gap-1.5 truncate rounded-md border px-1.5 py-1 text-left text-[11px] font-medium', t.overdue ? 'border-destructive/40 text-destructive' : 'border-border text-foreground')}
                >
                    {t.isMilestone ? <Diamond className="h-2 w-2 shrink-0" /> : <span className="h-2 w-2 shrink-0 rounded-full border-[1.5px] border-current" aria-hidden />}
                    <span className="truncate">{t.title}</span>
                </button>
            ))}
            {tasks.length > 4 && <p className="px-1 text-[11px] text-muted-foreground">+{tasks.length - 4} more</p>}
        </div>
    );
};

/** List view: late tasks first, then the month's tasks grouped by due day. */
export const TaskAgenda: React.FC<{ tasks: readonly ScheduleTask[]; monthStart: string; monthEnd: string; jobNames: ReadonlyMap<string, string>; onOpen: (jobId: string) => void; heading: (day: string) => string }> = ({ tasks, monthStart, monthEnd, jobNames, onOpen, heading }) => {
    const agenda = scheduleAgenda(tasks, monthStart, monthEnd);
    if (!agenda.overdue.length && !agenda.days.length) return null;
    const year = new Date().getFullYear();
    return (
        <section aria-label="Tasks" className="space-y-4">
            <h2 className="border-b border-border pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tasks</h2>
            {agenda.overdue.length > 0 && (
                <div>
                    <h3 className="mb-2 text-sm font-semibold text-destructive">Late</h3>
                    <div className="space-y-1.5">{agenda.overdue.slice(0, 20).map(t => <TaskRow key={t.id} task={t} jobName={jobNames.get(t.jobId) || ''} onOpen={onOpen} year={year} />)}</div>
                </div>
            )}
            {agenda.days.map(d => (
                <div key={d.day}>
                    <h3 className="mb-2 text-sm font-semibold text-foreground">Due {heading(d.day)}</h3>
                    <div className="space-y-1.5">{d.tasks.map(t => <TaskRow key={t.id} task={t} jobName={jobNames.get(t.jobId) || ''} onOpen={onOpen} year={year} />)}</div>
                </div>
            ))}
        </section>
    );
};
