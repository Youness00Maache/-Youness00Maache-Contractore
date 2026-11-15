/**
 * The job's tasks on a timeline (Gantt style): one row per task, a bar from its first to its last day, a diamond for
 * a milestone, a line from a task to the ones that wait for it, the "after: ..." hint beside the name, late tasks in
 * red, the longest chain outlined, a line for today. Scrolls sideways on a phone and opens on today.
 * Rows follow the first day of each task (then the manual order). Layout numbers come from lib/tasks/taskLogic.ts.
 */
import React, { useEffect, useId, useMemo, useRef } from 'react';
import type { JobTask } from '../../lib/tasks/taskTypes.ts';
import { displayStatus, layoutTimeline, taskSpan, timelineWindow, type TimelineBar } from '../../lib/tasks/taskLogic.ts';
import { afterLabel, dueLabel, shortDay, timelineTicks } from '../../lib/tasks/taskView.ts';
import { cx, Diamond } from './taskUi.tsx';

const DAY_W = 34;
const ROW_H = 40;
const HEAD_H = 44;
const BAR_H = 22;
/** a bar at least this wide carries its name inside */
const INSIDE_W = 150;

export interface TasksTimelineProps {
    tasks: readonly JobTask[];
    today: string;
    onOpen: (task: JobTask) => void;
}

const barTone = (b: TimelineBar, status: string): string => {
    if (b.done) return 'bg-success/45 text-foreground';
    if (b.overdue) return 'bg-destructive text-white';
    if (status === 'doing') return 'bg-primary text-primary-foreground';
    if (b.waiting || status === 'blocked') return 'bg-warning/85 text-warning-foreground';
    return 'bg-primary/40 text-foreground ring-1 ring-inset ring-primary/50';
};

const TasksTimeline: React.FC<TasksTimelineProps> = ({ tasks, today, onOpen }) => {
    const markerId = useId().replace(/:/g, '');
    const scroller = useRef<HTMLDivElement>(null);

    const byId = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks]);
    // rows: first day, then the manual order
    const ranked = useMemo(() => [...tasks].sort((a, b) => {
        const x = taskSpan(a);
        const y = taskSpan(b);
        return (x?.start || '9999').localeCompare(y?.start || '9999') || a.sortOrder - b.sortOrder;
    }).map((t, i) => ({ ...t, sortOrder: i })), [tasks]);
    const win = useMemo(() => timelineWindow(tasks, today), [tasks, today]);
    const layout = useMemo(() => layoutTimeline(ranked, win, today), [ranked, win, today]);
    const ticks = useMemo(() => timelineTicks(win), [win]);
    const barOf = useMemo(() => new Map(layout.bars.map(b => [b.id, b])), [layout]);
    const critical = useMemo(() => new Set(layout.criticalPath), [layout]);

    const width = win.days * DAY_W;
    const height = HEAD_H + layout.bars.length * ROW_H + 8;
    const rowMid = (row: number) => HEAD_H + row * ROW_H + ROW_H / 2;

    // open on today (a little to the left so the coming days show)
    useEffect(() => {
        const el = scroller.current;
        if (!el || layout.todayOffset === null) return;
        el.scrollLeft = Math.max(0, layout.todayOffset * DAY_W - el.clientWidth / 3);
    }, [layout.todayOffset, win.start]);

    const open = (id: string) => { const t = byId.get(id); if (t) onOpen(t); };
    const year = Number(today.slice(0, 4));

    const links = layout.links.flatMap(l => {
        const a = barOf.get(l.from);
        const b = barOf.get(l.to);
        if (!a || !b) return [];
        const x1 = a.offset * DAY_W + (a.isMilestone ? DAY_W / 2 + 8 : a.length * DAY_W - 2);
        const x2 = b.offset * DAY_W + (b.isMilestone ? DAY_W / 2 - 8 : 2);
        const y1 = rowMid(a.row);
        const y2 = rowMid(b.row);
        const mid = y1 + (y2 >= y1 ? ROW_H / 2 : -ROW_H / 2);
        const d = x2 >= x1 + 12
            ? `M${x1},${y1} H${x1 + 6} V${y2} H${x2 - 1}`
            : `M${x1},${y1} H${x1 + 6} V${mid} H${x2 - 6} V${y2} H${x2 - 1}`;
        return [{ key: `${l.from}>${l.to}`, d, late: b.overdue }];
    });

    if (!layout.bars.length) {
        return (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                {layout.unscheduled.length
                    ? 'Give your tasks start and due dates to see them on the timeline.'
                    : 'Add tasks with dates and they show up here as bars.'}
                {layout.unscheduled.length > 0 && (
                    <ul className="mt-3 flex flex-wrap justify-center gap-1.5">
                        {layout.unscheduled.slice(0, 12).map(id => <li key={id}><button type="button" onClick={() => open(id)} className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground">{byId.get(id)?.title}</button></li>)}
                    </ul>
                )}
            </div>
        );
    }

    return (
        <section aria-label="Task timeline" className="space-y-2">
            <div ref={scroller} className="overflow-x-auto overscroll-x-contain rounded-2xl border border-border bg-card" tabIndex={0} aria-label="Timeline, scroll sideways">
                <div className="relative" style={{ width, height }}>
                    {/* weekends + Mondays */}
                    {ticks.map(tk => (tk.weekend ? <span key={`w${tk.offset}`} className="absolute bottom-0 bg-muted/55" style={{ left: tk.offset * DAY_W, width: DAY_W, top: HEAD_H }} aria-hidden /> : null))}
                    {ticks.map(tk => (tk.monday || tk.dom === 1 ? <span key={`m${tk.offset}`} className="absolute bottom-0 w-px bg-border" style={{ left: tk.offset * DAY_W, top: tk.month ? 0 : HEAD_H - 14 }} aria-hidden /> : null))}

                    {/* header */}
                    <div className="absolute inset-x-0 top-0 border-b border-border" style={{ height: HEAD_H }} aria-hidden>
                        {ticks.map(tk => {
                            const isToday = tk.day === today;
                            return (
                                <span key={tk.offset} className="absolute flex flex-col items-center justify-end pb-1.5" style={{ left: tk.offset * DAY_W, width: DAY_W, top: 0, bottom: 0 }}>
                                    {tk.month && <span className="absolute left-1 top-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{tk.month}</span>}
                                    <span className={cx('flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums', isToday ? 'bg-primary text-primary-foreground' : tk.weekend ? 'text-muted-foreground/70' : 'text-muted-foreground')}>{tk.dom}</span>
                                </span>
                            );
                        })}
                    </div>

                    {/* today */}
                    {layout.todayOffset !== null && (
                        <span className="pointer-events-none absolute bottom-0 w-0.5 bg-primary/70" style={{ left: layout.todayOffset * DAY_W + DAY_W / 2 - 1, top: HEAD_H - 6 }} aria-hidden />
                    )}

                    {/* links */}
                    <svg className="pointer-events-none absolute left-0 top-0 text-muted-foreground" width={width} height={height} aria-hidden>
                        <defs>
                            <marker id={`arr-${markerId}`} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="currentColor" /></marker>
                        </defs>
                        {links.map(l => <path key={l.key} d={l.d} fill="none" stroke="currentColor" strokeOpacity={0.55} strokeWidth={1.25} markerEnd={`url(#arr-${markerId})`} />)}
                    </svg>

                    {/* rows */}
                    {layout.bars.map(b => {
                        const task = byId.get(b.id)!;
                        const shown = displayStatus(task, byId);
                        const left = b.offset * DAY_W;
                        const w = b.isMilestone ? DAY_W : Math.max(b.length * DAY_W, DAY_W);
                        const barLeft = b.isMilestone ? left + DAY_W / 2 - 8 : left + 2;
                        const barW = b.isMilestone ? 16 : w - 4;
                        const top = HEAD_H + b.row * ROW_H + (ROW_H - BAR_H) / 2;
                        const inside = !b.isMilestone && barW >= INSIDE_W;
                        const after = afterLabel(task, byId);
                        const due = dueLabel(task, today);
                        const span = taskSpan(task);
                        const rightSide = left + w <= width * 0.62;
                        const outerStyle: React.CSSProperties = rightSide
                            ? { left: barLeft + barW + 8, top, height: BAR_H, maxWidth: Math.max(160, width - (barLeft + barW + 12)) }
                            : { right: width - barLeft + 8, top, height: BAR_H, maxWidth: Math.max(160, barLeft - 12) };
                        const aria = `${task.title}${span ? `, ${shortDay(span.start, 'en', year)}${span.end !== span.start ? ` to ${shortDay(span.end, 'en', year)}` : ''}` : ''}, ${due.text}`;
                        return (
                            <React.Fragment key={b.id}>
                                {b.isMilestone ? (
                                    <button
                                        type="button"
                                        onClick={() => open(b.id)}
                                        aria-label={`Milestone: ${aria}`}
                                        title={aria}
                                        className={cx('absolute rotate-45 rounded-[4px] border-2 border-card', b.done ? 'bg-success' : b.overdue ? 'bg-destructive' : 'bg-foreground', critical.has(b.id) && 'ring-2 ring-foreground/35 ring-offset-1 ring-offset-card')}
                                        style={{ left: barLeft + 1, top: top + 3, width: 16, height: 16 }}
                                    />
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => open(b.id)}
                                        aria-label={`Task: ${aria}`}
                                        title={aria}
                                        className={cx(
                                            'absolute flex items-center overflow-hidden px-2 text-left text-[11px] font-semibold leading-none shadow-soft',
                                            barTone(b, shown),
                                            b.clippedStart ? 'rounded-l-none' : 'rounded-l-md',
                                            b.clippedEnd ? 'rounded-r-none' : 'rounded-r-md',
                                            critical.has(b.id) && 'outline outline-2 outline-offset-1 outline-foreground/35',
                                        )}
                                        style={{ left: barLeft, top, width: barW, height: BAR_H }}
                                    >
                                        {inside && <span className={cx('truncate', b.done && 'line-through decoration-foreground/40')}>{task.title}</span>}
                                    </button>
                                )}
                                {!inside && (
                                    <button
                                        type="button"
                                        onClick={() => open(b.id)}
                                        tabIndex={-1}
                                        aria-hidden
                                        className={cx('absolute flex items-center gap-1.5 whitespace-nowrap text-xs', rightSide ? 'text-left' : 'flex-row-reverse text-right')}
                                        style={outerStyle}
                                    >
                                        <span className={cx('truncate font-semibold', b.done ? 'text-muted-foreground line-through decoration-muted-foreground/40' : b.overdue ? 'text-destructive' : 'text-foreground')}>{task.title}</span>
                                        {after && <span className="truncate text-[11px] font-normal text-muted-foreground">{after}</span>}
                                    </button>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* legend */}
            <p className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-primary/40 ring-1 ring-inset ring-primary/50" />To do</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-primary" />In progress</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-warning/85" />Waiting</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-destructive" />Late</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-success/45" />Done</span>
                <span className="inline-flex items-center gap-1.5"><Diamond className="text-foreground" />Milestone</span>
                {layout.criticalPath.length > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm outline outline-2 outline-offset-1 outline-foreground/35" />Longest chain</span>}
            </p>

            {layout.unscheduled.length > 0 && (
                <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-xs">
                    <p className="font-semibold text-foreground">No dates yet ({layout.unscheduled.length})</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {layout.unscheduled.slice(0, 16).map(id => <li key={id}><button type="button" onClick={() => open(id)} className="max-w-[16rem] truncate rounded-full border border-border bg-card px-2.5 py-1 font-medium text-foreground">{byId.get(id)?.title}</button></li>)}
                    </ul>
                </div>
            )}
            {layout.outside.length > 0 && <p className="px-1 text-xs text-muted-foreground">{layout.outside.length} task{layout.outside.length === 1 ? ' is' : 's are'} too far out to fit on this timeline.</p>}
        </section>
    );
};

export default TasksTimeline;
