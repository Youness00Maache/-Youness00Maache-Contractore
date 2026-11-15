/**
 * "Review before saving" for suggested tasks (AI from a note, a work order, a template): a ticked list the
 * contractor can edit and untick. Nothing is saved until "Add N tasks" is pressed (the caller saves).
 *   ReviewList      the rows (checkbox, name, dates, who, "after: ...")
 *   ProposalsModal  a modal around ReviewList for ProposedTask[] (AI and work orders)
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { ProposedTask } from '../../lib/tasks/taskTypes.ts';
import { isYmd } from '../../lib/tasks/taskLogic.ts';
import { keepProposals, shortDay } from '../../lib/tasks/taskView.ts';
import { Modal } from '../viewKit.tsx';
import { Diamond, cx } from './taskUi.tsx';

export interface ReviewRow {
    title: string;
    start: string | null;
    due: string | null;
    isMilestone: boolean;
    /** who does it (a name), '' when nobody */
    who: string;
    /** names of the earlier rows it waits for */
    after: string[];
    /** the work order / note text behind it, shown small */
    note?: string | null;
}

const rowDates = (r: ReviewRow): string => {
    if (r.isMilestone) return r.due || r.start ? `Milestone ${shortDay(r.due || r.start)}` : 'Milestone';
    if (r.start && r.due && r.start !== r.due) return `${shortDay(r.start)} to ${shortDay(r.due)}`;
    if (r.due) return `Due ${shortDay(r.due)}`;
    if (r.start) return `Starts ${shortDay(r.start)}`;
    return 'No date';
};

export const ReviewList: React.FC<{
    rows: readonly ReviewRow[];
    keep: readonly boolean[];
    onKeep: (index: number, value: boolean) => void;
    onTitle?: (index: number, title: string) => void;
    onDue?: (index: number, ymd: string) => void;
    disabled?: boolean;
}> = ({ rows, keep, onKeep, onTitle, onDue, disabled }) => (
    <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
        {rows.map((r, i) => (
            <li key={i} className={cx('flex items-start gap-2.5 px-3 py-2.5', !keep[i] && 'bg-muted/40')}>
                <input
                    type="checkbox"
                    className="mt-2.5 h-[18px] w-[18px] shrink-0 accent-[hsl(var(--primary))]"
                    checked={!!keep[i]}
                    disabled={disabled}
                    onChange={e => onKeep(i, e.target.checked)}
                    aria-label={`Add “${r.title}”`}
                />
                <div className={cx('min-w-0 flex-1', !keep[i] && 'opacity-60')}>
                    <div className="flex items-center gap-1.5">
                        {r.isMilestone && <Diamond className="shrink-0 text-foreground" />}
                        {onTitle
                            ? <input className="input h-9 min-w-0 flex-1 py-1 text-sm font-semibold" value={r.title} onChange={e => onTitle(i, e.target.value)} disabled={disabled || !keep[i]} maxLength={200} aria-label={`Name of task ${i + 1}`} />
                            : <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.title}</span>}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                        {onDue && !r.isMilestone ? (
                            <label className="inline-flex items-center gap-1.5">
                                <span>Due</span>
                                <input type="date" className="input h-8 w-auto py-0 text-xs" value={r.due || ''} onChange={e => onDue(i, e.target.value)} disabled={disabled || !keep[i]} aria-label={`Due date of task ${i + 1}`} />
                            </label>
                        ) : <span>{rowDates(r)}</span>}
                        {onDue && !r.isMilestone && r.start && <span>Starts {shortDay(r.start)}</span>}
                        {r.who && <span>@{r.who}</span>}
                        {r.after.length > 0 && <span className="truncate">after {r.after.length === 1 ? r.after[0] : `${r.after[0]} + ${r.after.length - 1} more`}</span>}
                    </p>
                    {r.note && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/90">{r.note}</p>}
                </div>
            </li>
        ))}
    </ul>
);

export const ProposalsModal: React.FC<{
    title: string;
    intro?: React.ReactNode;
    proposals: readonly ProposedTask[];
    busy?: boolean;
    error?: string;
    confirmLabel?: (count: number) => string;
    onCancel: () => void;
    onConfirm: (kept: ProposedTask[]) => void | Promise<void>;
}> = ({ title, intro, proposals, busy, error, confirmLabel, onCancel, onConfirm }) => {
    const [items, setItems] = useState<ProposedTask[]>(() => proposals.map(p => ({ ...p })));
    const [keep, setKeep] = useState<boolean[]>(() => proposals.map(() => true));
    useEffect(() => { setItems(proposals.map(p => ({ ...p }))); setKeep(proposals.map(() => true)); }, [proposals]);

    const rows: ReviewRow[] = useMemo(() => items.map(p => ({
        title: p.title,
        start: p.startDate,
        due: p.dueDate,
        isMilestone: p.isMilestone,
        who: p.assigneeName || '',
        after: p.dependsOnIndex.map(n => items[n]?.title).filter((n): n is string => !!n),
    })), [items]);

    const count = keep.filter(Boolean).length;
    const submit = () => {
        const cleaned = items.map(p => ({ ...p, title: p.title.replace(/\s+/g, ' ').trim() }));
        // a ticked task with an empty name is not added
        const flags = keep.map((k, i) => k && !!cleaned[i].title);
        void onConfirm(keepProposals(cleaned, flags));
    };

    return (
        <Modal
            open
            onClose={onCancel}
            busy={busy}
            size="lg"
            title={title}
            description={intro}
            footer={(
                <>
                    <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || count === 0}>
                        {busy ? 'Adding…' : confirmLabel ? confirmLabel(count) : `Add ${count} task${count === 1 ? '' : 's'}`}
                    </button>
                </>
            )}
        >
            <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-muted-foreground">{count} of {items.length} ticked</span>
                    <span className="flex gap-3">
                        <button type="button" className="font-semibold text-primary" onClick={() => setKeep(items.map(() => true))} disabled={busy}>All</button>
                        <button type="button" className="font-semibold text-primary" onClick={() => setKeep(items.map(() => false))} disabled={busy}>None</button>
                    </span>
                </div>
                <ReviewList
                    rows={rows}
                    keep={keep}
                    disabled={busy}
                    onKeep={(i, v) => setKeep(cur => cur.map((k, j) => (j === i ? v : k)))}
                    onTitle={(i, v) => setItems(cur => cur.map((p, j) => (j === i ? { ...p, title: v } : p)))}
                    onDue={(i, v) => setItems(cur => cur.map((p, j) => (j === i ? { ...p, dueDate: isYmd(v) ? v : null } : p)))}
                />
                {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
            </div>
        </Modal>
    );
};
