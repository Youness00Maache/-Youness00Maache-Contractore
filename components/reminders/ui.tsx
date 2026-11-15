/**
 * Small building blocks shared by the reminder screens (document panel, settings card, list).
 * Design-system classes only (index.css), so light / dark / blue themes work.
 */
import React from 'react';
import {
    formatShortDate, REASON_LABELS, stepLabel, type PostJobKind, type ReminderKind, type StepState, type StepView,
} from '../../lib/reminders.ts';

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/** Compact on/off switch (same look as the forms' Toggle, without the row around it). */
export const Switch: React.FC<{
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    disabled?: boolean;
    busy?: boolean;
}> = ({ checked, onChange, label, disabled, busy }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        title={label}
        disabled={disabled || busy}
        onClick={() => onChange(!checked)}
        className={cx(
            'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            checked ? 'bg-primary' : 'bg-muted ring-1 ring-inset ring-border',
        )}
    >
        <span className={cx('inline-block h-5 w-5 rounded-full bg-card shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1', busy && 'animate-pulse')} />
    </button>
);

/** Three-letter tag for the kind of reminder (reads faster than an icon in a dense list). */
export const KindTag: React.FC<{ kind: ReminderKind | PostJobKind; className?: string }> = ({ kind, className }) => (
    <span
        className={cx(
            'inline-flex h-6 w-11 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold uppercase tracking-wider',
            kind === 'invoice' ? 'bg-primary/10 text-primary' : kind === 'estimate' ? 'bg-warning/15 text-warning' : kind === 'visit' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
            className,
        )}
        aria-label={kind}
    >
        {kind === 'invoice' ? 'INV' : kind === 'estimate' ? 'EST' : kind === 'visit' ? 'VISIT' : kind === 'completion' ? 'THX' : kind === 'warranty' ? 'WAR' : 'MAINT'}
    </span>
);

const STATE_TEXT: Record<StepState, string> = {
    sent: 'Sent',
    skipped: 'Skipped',
    failed: 'Not sent',
    sending: 'Sending',
    planned: 'Planned',
    due: 'Going out',
    missed: 'Missed',
    superseded: 'Replaced',
};

const STATE_CLASS: Record<StepState, string> = {
    sent: 'text-success',
    skipped: 'text-muted-foreground',
    failed: 'text-destructive',
    sending: 'text-primary',
    planned: 'text-foreground',
    due: 'text-primary',
    missed: 'text-muted-foreground',
    superseded: 'text-muted-foreground',
};

export const stateText = (step: StepView): string => {
    if (step.state === 'skipped' || step.state === 'failed') {
        const reason = step.record?.reason ? REASON_LABELS[step.record.reason] : '';
        return reason ? `${STATE_TEXT[step.state]}: ${reason.toLowerCase()}` : STATE_TEXT[step.state];
    }
    if (step.state === 'missed') return 'Missed (too late to send)';
    if (step.state === 'superseded') return 'Replaced by a later one';
    return STATE_TEXT[step.state];
};

/**
 * The schedule of one document as a vertical rail: date, what it is, and its state.
 * `muted` greys out planned steps (reminders off / stopped), so the user still sees what would happen.
 */
export const StepRail: React.FC<{ kind: ReminderKind; steps: StepView[]; muted?: boolean; mutedLabel?: string }> = ({ kind, steps, muted, mutedLabel = 'Off' }) => (
    <ol className="relative ml-1.5 border-l border-border">
        {steps.map((s) => {
            const done = s.state === 'sent';
            const off = muted && (s.state === 'planned' || s.state === 'due');
            return (
                <li key={s.dedupeKey} className="relative flex min-h-[40px] items-center gap-3 py-1.5 pl-4">
                    <span
                        aria-hidden
                        className={cx(
                            'absolute -left-[5px] h-2.5 w-2.5 rounded-full border-2',
                            done ? 'border-success bg-success' : s.state === 'due' && !off ? 'border-primary bg-primary' : s.state === 'planned' && !off ? 'border-primary bg-card' : 'border-border bg-muted',
                        )}
                    />
                    <span className={cx('w-[88px] shrink-0 text-sm font-semibold tabular-nums', off || s.state === 'missed' || s.state === 'superseded' ? 'text-muted-foreground' : 'text-foreground')}>
                        {formatShortDate(s.state === 'sent' && s.record?.sentAt ? s.record.sentAt.slice(0, 10) : s.sendDate)}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className={cx('block truncate text-sm', off ? 'text-muted-foreground' : 'text-foreground')}>{stepLabel(kind, s.offset)}</span>
                        {s.shifted && s.state !== 'sent' && <span className="block text-xs text-muted-foreground">Moved to the day you switched reminders on</span>}
                    </span>
                    <span className={cx('shrink-0 text-xs font-medium', off ? 'text-muted-foreground' : STATE_CLASS[s.state])}>{off ? mutedLabel : stateText(s)}</span>
                </li>
            );
        })}
    </ol>
);

/** One-line inline message used inside the reminder cards. */
export const InlineNote: React.FC<{ tone?: 'muted' | 'warning' | 'danger' | 'info'; children: React.ReactNode; action?: React.ReactNode }> = ({ tone = 'muted', children, action }) => (
    <div
        className={cx(
            'flex flex-col gap-2 rounded-xl px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between',
            tone === 'warning' ? 'bg-warning/10 text-foreground' : tone === 'danger' ? 'bg-destructive/10 text-foreground' : tone === 'info' ? 'bg-primary/5 text-foreground' : 'bg-muted/60 text-muted-foreground',
        )}
        role={tone === 'danger' || tone === 'warning' ? 'alert' : undefined}
    >
        <span className="min-w-0">{children}</span>
        {action && <span className="flex shrink-0 gap-2">{action}</span>}
    </div>
);

/** "Today", "Tomorrow" or "Fri, Nov 20". */
export const dayHeading = (ymd: string, today: string, tomorrow: string): string =>
    ymd <= today ? 'Today' : ymd === tomorrow ? 'Tomorrow' : formatShortDate(ymd);

export const hourLabel = (h: number): string => {
    const hour = ((h % 24) + 24) % 24;
    const suffix = hour < 12 ? 'AM' : 'PM';
    const twelve = hour % 12 === 0 ? 12 : hour % 12;
    return `${twelve}:00 ${suffix}`;
};
