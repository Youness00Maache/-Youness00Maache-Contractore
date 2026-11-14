/**
 * Crew hours (Crew page › Hours): one week, one card per worker. A time-card grid (jobs × Mon–Sun) with totals,
 * regular / overtime and cost at the worker's own rate, the shifts that need a look (missed clock-out, no location,
 * far from the job, long shift), fixes (edit a shift, add a missing clock-out, add a whole shift), "Approve week",
 * and "Create time sheet" which saves the hours as the existing Time Sheet document (one per job), so job costing,
 * profit and "Bill time & materials" use them.
 */
import React, { useMemo, useState } from 'react';
import type { FormData as FormDataType, Job, UserProfile } from '../../types.ts';
import {
    OVERTIME_RULES, PUNCH_LABEL, addDays, buildSessions, clockLabel, durationLabel, hoursLabel, laborCostAt, localDayOf, needsAttention,
    sessionCounts, shortDayLabel, summarizeWeek, weekRangeLabel, weekStartOf, weekdayLetter, type MemberWeek, type OvertimeRule, type Punch,
    type PunchKind, type WorkSession,
} from '../../lib/crew/crewLogic.ts';
import { planTimeSheets } from '../../lib/crew/crewTimesheet.ts';
import { addOwnerPunch, deletePunch, punchPhotoUrl, setPunchesApproved, updatePunch, type CrewData } from '../../lib/crew/crewApi.ts';
import { CrewTimesheetLimitError, saveCrewTimeSheet } from '../../lib/crew/crewTimesheetApi.ts';
import { ChevronLeftIcon, ChevronRightIcon, ConfirmDialog, Modal } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { PlusIcon } from '../Icons.tsx';
import { Chip, LiveDot, cx, openShiftLabel, shiftChips } from './crewUi.tsx';

const money0 = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** "2026-11-10T07:02" for <input type="datetime-local"> (local time). */
const toLocalInput = (t: number): string => {
    const d = new Date(t);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string): number => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : NaN;
};

// ------------------------------------------------------------------------------------------------- shift editor
interface EditRow { id: string | null; kind: PunchKind; value: string; remove: boolean; original: Punch | null }

const ShiftEditor: React.FC<{
    session: WorkSession;
    memberName: string;
    jobs: readonly Job[];
    onClose: () => void;
    onDone: (change: { updated: Punch[]; added: Punch[]; removed: string[] }) => void;
}> = ({ session, memberName, jobs, onClose, onDone }) => {
    const [jobId, setJobId] = useState(session.jobId);
    const [rows, setRows] = useState<EditRow[]>(() => {
        const list: EditRow[] = session.punches.map(p => ({ id: p.id, kind: p.kind, value: toLocalInput(new Date(p.at).getTime()), remove: false, original: p }));
        if (!session.inPunch) list.unshift({ id: null, kind: 'in', value: toLocalInput(session.start - 8 * 3_600_000), remove: false, original: null });
        if (!session.outPunch) list.push({ id: null, kind: 'out', value: toLocalInput(Math.max(session.start + 8 * 3_600_000, Math.min(Date.now(), session.start + 8 * 3_600_000))), remove: false, original: null });
        return list;
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);

    const save = async () => {
        const kept = rows.filter(r => !r.remove);
        const times = kept.map(r => fromLocalInput(r.value));
        if (times.some(t => !Number.isFinite(t))) { setErr('Check the times.'); return; }
        const inT = kept.find(r => r.kind === 'in');
        const outT = kept.find(r => r.kind === 'out');
        if (inT && outT && fromLocalInput(outT.value) <= fromLocalInput(inT.value)) { setErr('The clock-out must be after the clock-in.'); return; }
        if (times.some(t => t > Date.now() + 86_400_000)) { setErr('A time is more than a day in the future.'); return; }
        setBusy(true);
        setErr('');
        try {
            const updated: Punch[] = [];
            const added: Punch[] = [];
            const removed: string[] = [];
            for (const r of rows) {
                if (r.remove && r.original) { await deletePunch(r.original); removed.push(r.original.id); continue; }
                if (r.remove) continue;
                const at = new Date(fromLocalInput(r.value)).toISOString();
                if (!r.original) {
                    added.push(await addOwnerPunch({ memberId: session.memberId, jobId, kind: r.kind, at }));
                } else if (Math.abs(new Date(r.original.at).getTime() - fromLocalInput(r.value)) >= 60_000 || r.original.jobId !== jobId) {
                    const patch: { at?: string; jobId?: string } = {};
                    if (Math.abs(new Date(r.original.at).getTime() - fromLocalInput(r.value)) >= 60_000) patch.at = at;
                    if (r.original.jobId !== jobId) patch.jobId = jobId;
                    updated.push(await updatePunch(r.original.id, patch));
                }
            }
            onDone({ updated, added, removed });
        } catch (e) {
            setErr((e as Error)?.message || 'Could not save.');
        } finally {
            setBusy(false);
        }
    };

    const deleteShift = async () => {
        setBusy(true);
        try {
            for (const p of session.punches) await deletePunch(p);
            onDone({ updated: [], added: [], removed: session.punches.map(p => p.id) });
        } catch (e) {
            setErr((e as Error)?.message || 'Could not delete.');
        } finally {
            setBusy(false);
            setConfirmDelete(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            title={`${memberName} · ${shortDayLabel(session.day)}`}
            description="Fix the times. The worker’s original time is kept and the shift is marked Edited."
            footer={(
                <>
                    <button type="button" className="btn btn-ghost text-destructive sm:mr-auto" onClick={() => setConfirmDelete(true)} disabled={busy}>Delete shift</button>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
                </>
            )}
        >
            <div className="space-y-4">
                <label className="block">
                    <span className="label">Job</span>
                    <select className="input" value={jobId} onChange={e => setJobId(e.target.value)}>
                        {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                        {!jobs.some(j => j.id === jobId) && <option value={jobId}>(this job)</option>}
                    </select>
                </label>
                <ul className="space-y-2">
                    {rows.map((r, i) => (
                        <li key={r.id || `new-${i}`} className={cx('flex items-center gap-2', r.remove && 'opacity-50')}>
                            <span className="w-28 shrink-0 text-sm font-medium">
                                {PUNCH_LABEL[r.kind]}{!r.original && <span className="block text-[11px] font-semibold text-primary">added by you</span>}
                            </span>
                            <input type="datetime-local" className="input min-w-0 flex-1 tabular-nums" value={r.value} disabled={r.remove}
                                onChange={e => setRows(prev => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} aria-label={PUNCH_LABEL[r.kind]} />
                            {(r.kind === 'break_start' || r.kind === 'break_end' || !r.original || (r.original !== session.inPunch && r.original !== session.outPunch)) && (
                                <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={() => setRows(prev => prev.map((x, j) => (j === i ? { ...x, remove: !x.remove } : x)))}>
                                    {r.remove ? 'Undo' : 'Remove'}
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
                {session.punches.some(p => p.originalAt) && (
                    <p className="text-xs text-muted-foreground">Worker’s times: {session.punches.filter(p => p.originalAt).map(p => `${PUNCH_LABEL[p.kind]} ${clockLabel(p.originalAt!)}`).join(' · ')}</p>
                )}
                {err && <p className="text-sm font-medium text-destructive" role="alert">{err}</p>}
            </div>
            <ConfirmDialog open={confirmDelete} title="Delete this shift?" message="Its punches (and photo) are deleted. This can’t be undone." confirmLabel="Delete" destructive busy={busy}
                onConfirm={() => void deleteShift()} onCancel={() => setConfirmDelete(false)} />
        </Modal>
    );
};

// ------------------------------------------------------------------------------------------------- add a shift
const AddShift: React.FC<{
    memberId: string;
    memberName: string;
    jobs: readonly Job[];
    defaultJobId?: string;
    defaultDay: string;
    onClose: () => void;
    onDone: (added: Punch[]) => void;
}> = ({ memberId, memberName, jobs, defaultJobId, defaultDay, onClose, onDone }) => {
    const [jobId, setJobId] = useState(defaultJobId || jobs[0]?.id || '');
    const [day, setDay] = useState(defaultDay);
    const [start, setStart] = useState('07:00');
    const [end, setEnd] = useState('15:30');
    const [breakMin, setBreakMin] = useState('30');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');

    const save = async () => {
        const s = fromLocalInput(`${day}T${start}`);
        let e = fromLocalInput(`${day}T${end}`);
        if (!jobId || !Number.isFinite(s) || !Number.isFinite(e)) { setErr('Pick a job, a day and the times.'); return; }
        if (e <= s) e += 86_400_000; // overnight
        const brk = Math.max(0, Math.min(Number(breakMin) || 0, Math.floor((e - s) / 60_000) - 1));
        if (e > Date.now() + 86_400_000) { setErr('That is more than a day in the future.'); return; }
        setBusy(true);
        setErr('');
        try {
            const added: Punch[] = [];
            added.push(await addOwnerPunch({ memberId, jobId, kind: 'in', at: new Date(s).toISOString() }));
            if (brk > 0) {
                const bs = s + Math.round((e - s - brk * 60_000) / 2 / 60_000) * 60_000;
                added.push(await addOwnerPunch({ memberId, jobId, kind: 'break_start', at: new Date(bs).toISOString() }));
                added.push(await addOwnerPunch({ memberId, jobId, kind: 'break_end', at: new Date(bs + brk * 60_000).toISOString() }));
            }
            added.push(await addOwnerPunch({ memberId, jobId, kind: 'out', at: new Date(e).toISOString() }));
            onDone(added);
        } catch (x) {
            setErr((x as Error)?.message || 'Could not save.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal open onClose={onClose} busy={busy} title={`Add a shift for ${memberName}`} description="For a day they forgot to clock in. It is saved as added by you (no location)."
            footer={(
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Add shift'}</button>
                </>
            )}>
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                    <span className="label">Job</span>
                    <select className="input" value={jobId} onChange={e => setJobId(e.target.value)}>
                        {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                    </select>
                </label>
                <label className="block sm:col-span-2">
                    <span className="label">Day</span>
                    <input type="date" className="input" value={day} onChange={e => setDay(e.target.value)} />
                </label>
                <label className="block"><span className="label">Clock in</span><input type="time" className="input tabular-nums" value={start} onChange={e => setStart(e.target.value)} /></label>
                <label className="block"><span className="label">Clock out</span><input type="time" className="input tabular-nums" value={end} onChange={e => setEnd(e.target.value)} /></label>
                <label className="block"><span className="label">Break (minutes)</span><input inputMode="numeric" className="input tabular-nums" value={breakMin} onChange={e => setBreakMin(e.target.value.replace(/\D/g, '').slice(0, 3))} /></label>
                {err && <p className="text-sm font-medium text-destructive sm:col-span-2" role="alert">{err}</p>}
            </div>
        </Modal>
    );
};

// ------------------------------------------------------------------------------------------------- member card
const MemberCard: React.FC<{
    week: MemberWeek;
    weekDaysList: string[];
    name: string;
    rate: number | null;
    jobs: readonly Job[];
    data: CrewData;
    rule: OvertimeRule;
    today: string;
    isOnline: boolean;
    busy: string | null;
    onEdit: (s: WorkSession) => void;
    onAdd: () => void;
    onApprove: () => void;
    onTimeSheets: () => void;
    onOpenTimeSheet: (jobId: string, docId: string) => void;
}> = ({ week, weekDaysList, name, rate, jobs, data, rule, today, isOnline, busy, onEdit, onAdd, onApprove, onTimeSheets, onOpenTimeSheet }) => {
    const [open, setOpen] = useState(week.attention > 0);
    const jobName = (id: string) => jobs.find(j => j.id === id)?.name || 'Job';
    const cost = laborCostAt(week.regularMs, week.overtimeMs, rate);
    const plans = useMemo(() => planTimeSheets(week, { name }, { weekStart: weekDaysList[0], rule }), [week, name, weekDaysList, rule]);
    const pending = plans.filter(p => !p.upToDate);
    const made = plans.filter(p => p.existingTimesheetId);
    const running = (x: WorkSession) => x.open && !x.flags.includes('missing_out');
    const leftMissing = week.sessions.filter(x => !sessionCounts(x) && !running(x)).length;
    const leftRunning = week.sessions.some(running) ? 1 : 0;
    const counted = week.sessions.filter(sessionCounts).length;
    const dayFlag = (idx: number) => week.sessions.some(s => s.day === weekDaysList[idx] && needsAttention(s));
    const live = week.open ? openShiftLabel(week.open) : null;

    return (
        <article className="overflow-hidden rounded-2xl border border-border bg-card">
            <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
                <div className="min-w-0">
                    <h3 className="truncate text-base font-bold">{name}</h3>
                    {live && week.open ? (
                        <>
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold"><LiveDot tone={live.tone} /><span className={cx('whitespace-nowrap', live.tone === 'success' ? 'text-success' : live.tone === 'warning' ? 'text-warning' : 'text-destructive')}>{live.text}</span></p>
                            <p className="truncate pl-4 text-xs text-muted-foreground">{jobName(week.open.jobId)}</p>
                        </>
                    ) : <p className="mt-0.5 text-xs text-muted-foreground">{counted} shift{counted === 1 ? '' : 's'}{week.attention ? ` · ${week.attention} to check` : ''}</p>}
                </div>
                <div className="shrink-0 text-right">
                    <p className="font-mono text-2xl font-black leading-none tabular-nums">{hoursLabel(week.workedMs)}<span className="ml-0.5 text-sm font-semibold text-muted-foreground">h</span></p>
                    <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                        {hoursLabel(week.regularMs)} reg{week.overtimeMs ? <> · <span className="font-semibold text-warning">{hoursLabel(week.overtimeMs)} OT</span></> : null}{cost !== null ? ` · ${money0(cost)}` : ''}
                    </p>
                </div>
            </header>

            {/* time card: Mon–Sun columns, one row per job */}
            <div className="px-4 pb-3">
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {weekDaysList.map(d => (
                        <span key={d} className={cx(d === today && 'text-primary')}>{weekdayLetter(d).slice(0, 2)}<span className="block font-mono text-[11px] normal-case tracking-normal">{Number(d.slice(8))}</span></span>
                    ))}
                </div>
                {week.jobs.map(j => (
                    <div key={j.jobId} className="mt-2">
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                            <span className="truncate font-medium text-foreground">{jobName(j.jobId)}</span>
                            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{hoursLabel(j.workedMs)} h{j.overtimeMs ? ` (${hoursLabel(j.overtimeMs)} OT)` : ''}</span>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {j.days.map((v, i) => (
                                <span key={i} className={cx(
                                    'flex h-8 items-center justify-center rounded-md font-mono text-xs tabular-nums',
                                    v ? 'bg-primary/10 font-semibold text-foreground' : 'bg-muted/60 text-muted-foreground/60',
                                    dayFlag(i) && j.sessions.some(s => s.day === weekDaysList[i] && needsAttention(s)) && 'ring-1 ring-inset ring-warning',
                                )}>{v ? hoursLabel(v) : '·'}</span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-4 py-2.5">
                <button type="button" className="btn btn-ghost btn-sm -ml-2" onClick={() => setOpen(v => !v)} aria-expanded={open}>
                    {open ? 'Hide shifts' : `Shifts (${week.sessions.length})`}
                </button>
                <span className="flex-1" />
                {counted > 0 && (
                    <button type="button" className={cx('btn btn-sm', week.approved ? 'btn-ghost text-success' : 'btn-outline')} onClick={onApprove} disabled={!isOnline || busy !== null}>
                        {week.approved ? 'Approved ✓' : 'Approve week'}
                    </button>
                )}
                {plans.length > 0 && (pending.length ? (
                    <button type="button" className="btn btn-primary btn-sm" onClick={onTimeSheets} disabled={!isOnline || busy !== null}>
                        {busy === `ts:${week.memberId}` ? 'Saving…' : made.length ? `Update time sheet${pending.length === 1 ? '' : 's'}` : `Create time sheet${plans.length === 1 ? '' : 's'}`}
                    </button>
                ) : (
                    <button type="button" className="btn btn-ghost btn-sm text-success" onClick={() => made[0]?.existingTimesheetId && onOpenTimeSheet(made[0].jobId, made[0].existingTimesheetId)}>
                        Time sheet{made.length === 1 ? '' : 's'} made ✓
                    </button>
                ))}
            </div>
            {plans.length > 0 && (leftMissing > 0 || leftRunning > 0) && (
                <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                    {leftMissing > 0 && <span className="font-semibold text-warning">{leftMissing} shift{leftMissing === 1 ? ' is' : 's are'} left out of the time sheet until fixed (missing clock-in or clock-out). </span>}
                    {leftRunning > 0 && <span>Today’s shift is still running; it goes in once they clock out.</span>}
                </p>
            )}

            {open && (
                <ul className="divide-y divide-border border-t border-border">
                    {week.sessions.map(s => {
                        const chips = shiftChips(s, data.sites[s.jobId]);
                        const photos = s.punches.filter(p => p.photoPath);
                        const notes = s.punches.filter(p => p.note);
                        return (
                            <li key={s.key} className="px-4 py-2.5 text-sm">
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                    <span className="w-[4.5rem] shrink-0 font-medium">{shortDayLabel(s.day)}</span>
                                    <span className="font-mono tabular-nums">
                                        {s.inPunch ? clockLabel(s.start) : '—'} – {s.outPunch ? `${localDayOf(s.end!) !== s.day ? `${shortDayLabel(localDayOf(s.end!)).split(' ')[0]} ` : ''}${clockLabel(s.end!)}` : s.open && !s.flags.includes('missing_out') ? 'now' : '?'}
                                    </span>
                                    <span className="min-w-0 truncate text-muted-foreground">{jobName(s.jobId)}</span>
                                    <span className="ml-auto shrink-0 font-mono font-semibold tabular-nums">{sessionCounts(s) ? durationLabel(s.workedMs) : s.open && !s.flags.includes('missing_out') ? durationLabel(s.liveMs) : '—'}</span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-[5.25rem]">
                                    {s.breakMs >= 60_000 && <span className="text-xs text-muted-foreground">{durationLabel(s.breakMs)} break</span>}
                                    {chips.map(c => <Chip key={c.key} tone={c.tone} title={c.title}>{c.label}</Chip>)}
                                    {sessionCounts(s) && s.punches.every(p => p.approvedAt) && <Chip tone="success">Approved</Chip>}
                                    {photos.map(p => (
                                        <button key={p.id} type="button" className="text-xs font-semibold text-primary" onClick={() => void punchPhotoUrl(p.photoPath!).then(url => (url ? window.open(url, '_blank', 'noopener') : toast.error('The photo didn’t arrive.')))}>
                                            Photo ({PUNCH_LABEL[p.kind].toLowerCase()})
                                        </button>
                                    ))}
                                    <button type="button" className="ml-auto text-xs font-semibold text-primary disabled:opacity-50" onClick={() => onEdit(s)} disabled={!isOnline}>
                                        {s.flags.includes('missing_out') ? 'Add clock-out' : s.flags.includes('missing_in') ? 'Add clock-in' : 'Edit'}
                                    </button>
                                </div>
                                {notes.map(p => <p key={p.id} className="mt-1 pl-[5.25rem] text-xs text-muted-foreground">“{p.note}”</p>)}
                            </li>
                        );
                    })}
                    <li className="px-4 py-2">
                        <button type="button" className="inline-flex min-h-[36px] items-center gap-1.5 text-sm font-semibold text-primary disabled:opacity-50" onClick={onAdd} disabled={!isOnline}>
                            <PlusIcon className="h-4 w-4" /> Add a shift
                        </button>
                    </li>
                </ul>
            )}
        </article>
    );
};

// ------------------------------------------------------------------------------------------------- hours view
const CrewHours: React.FC<{
    data: CrewData;
    jobs: readonly (Job & { clientId?: string | null })[];
    userId: string;
    profile: UserProfile;
    isOnline: boolean;
    weekStart: string;
    setWeekStart: (w: string) => void;
    punches: Punch[];
    setPunches: React.Dispatch<React.SetStateAction<Punch[]>>;
    loading: boolean;
    error: string | null;
    now: number;
    rule: OvertimeRule;
    setRule: (r: OvertimeRule) => void;
    onTimeSheetsSaved: (docs: FormDataType[]) => void;
    onOpenTimeSheet: (jobId: string, docId: string) => void;
    onUpgrade: (reason?: string) => void;
}> = ({ data, jobs, userId, profile, isOnline, weekStart, setWeekStart, punches, setPunches, loading, error, now, rule, setRule, onTimeSheetsSaved, onOpenTimeSheet, onUpgrade }) => {
    const [busy, setBusy] = useState<string | null>(null);
    const [editing, setEditing] = useState<WorkSession | null>(null);
    const [adding, setAdding] = useState<string | null>(null);
    const sessions = useMemo(() => buildSessions(punches, { now }), [punches, now]);
    const week = useMemo(() => summarizeWeek(sessions, { weekStart, rule }), [sessions, weekStart, rule]);
    const memberById = useMemo(() => new Map(data.members.map(m => [m.id, m])), [data.members]);
    const today = localDayOf(now);
    const thisWeek = weekStartOf(today);
    const members = useMemo(() => [...week.members].filter(m => m.sessions.length || m.open)
        .sort((a, b) => (memberById.get(a.memberId)?.name || '').localeCompare(memberById.get(b.memberId)?.name || '')), [week.members, memberById]);
    const quiet = data.members.filter(m => m.active && !members.some(x => x.memberId === m.id));
    const attention = members.reduce((n, m) => n + m.attention, 0);
    const jobsFor = (memberId: string) => {
        const ids = new Set(data.assignments.filter(a => a.memberId === memberId).map(a => a.jobId));
        const list = jobs.filter(j => ids.has(j.id) || j.status === 'active');
        return list.length ? list : [...jobs];
    };

    const applyChange = (c: { updated: Punch[]; added: Punch[]; removed: string[] }) => {
        setPunches(prev => [
            ...prev.filter(p => !c.removed.includes(p.id)).map(p => c.updated.find(u => u.id === p.id) || p),
            ...c.added,
        ]);
    };

    const approve = async (m: MemberWeek) => {
        const ids = m.sessions.filter(sessionCounts).flatMap(s => s.punches.map(p => p.id));
        setBusy(`ap:${m.memberId}`);
        try {
            const at = await setPunchesApproved(ids, !m.approved);
            setPunches(prev => prev.map(p => (ids.includes(p.id) ? { ...p, approvedAt: at } : p)));
            toast.success(m.approved ? 'Approval removed.' : `${memberById.get(m.memberId)?.name || 'Week'} approved.`);
        } catch (e) {
            toast.error((e as Error)?.message || 'Could not save.');
        } finally {
            setBusy(null);
        }
    };

    const makeTimeSheets = async (m: MemberWeek) => {
        const member = memberById.get(m.memberId);
        const plans = planTimeSheets(m, { name: member?.name || 'Crew' }, { weekStart, rule }).filter(p => !p.upToDate);
        if (!plans.length) return;
        setBusy(`ts:${m.memberId}`);
        const docs: FormDataType[] = [];
        let made = 0;
        let updated = 0;
        try {
            for (const plan of plans) {
                const job = jobs.find(j => j.id === plan.jobId);
                if (!job) { toast.error('A job of these hours was deleted; its hours were skipped.'); continue; }
                const res = await saveCrewTimeSheet({ userId, job, profile, plan, rule });
                docs.push(res.doc);
                if (res.created) made++; else updated++;
                setPunches(prev => prev.map(p => (plan.punchIds.includes(p.id) ? { ...p, timesheetId: res.doc.id } : p)));
            }
            if (docs.length) {
                onTimeSheetsSaved(docs);
                toast.success([made ? `${made} time sheet${made === 1 ? '' : 's'} created` : '', updated ? `${updated} updated` : ''].filter(Boolean).join(', ') + '. Job costing now includes these hours.');
            }
        } catch (e) {
            if (e instanceof CrewTimesheetLimitError) onUpgrade(e.message);
            else toast.error((e as Error)?.message || 'Could not save the time sheet.');
            if (docs.length) onTimeSheetsSaved(docs);
        } finally {
            setBusy(null);
        }
    };

    const editingMember = editing ? memberById.get(editing.memberId) : null;
    const addingMember = adding ? memberById.get(adding) : null;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-xl border border-border bg-card">
                    <button type="button" className="btn btn-ghost h-10 w-10 rounded-r-none p-0" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeftIcon className="h-4 w-4" /></button>
                    <span className="min-w-[8.5rem] px-2 text-center text-sm font-semibold tabular-nums">{weekRangeLabel(weekStart)}</span>
                    <button type="button" className="btn btn-ghost h-10 w-10 rounded-l-none p-0" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))} disabled={weekStart >= thisWeek}><ChevronRightIcon className="h-4 w-4" /></button>
                </div>
                {weekStart !== thisWeek && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeekStart(thisWeek)}>This week</button>}
                <span className="flex-1" />
                <label className="sr-only" htmlFor="crew-ot">Overtime rule</label>
                <select id="crew-ot" className="input h-10 w-auto py-1.5 text-sm" value={rule} onChange={e => setRule(e.target.value as OvertimeRule)}>
                    {OVERTIME_RULES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
            </div>

            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span><span className="font-mono text-lg font-bold tabular-nums">{hoursLabel(week.workedMs)} h</span> <span className="text-muted-foreground">this week</span></span>
                {week.overtimeMs > 0 && <span className="font-semibold text-warning">{hoursLabel(week.overtimeMs)} h overtime</span>}
                {attention > 0 && <span className="font-semibold text-destructive">{attention} shift{attention === 1 ? '' : 's'} to check</span>}
            </p>

            {error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
            {loading && !punches.length ? (
                <div className="space-y-3" aria-busy="true">{[0, 1].map(i => <div key={i} className="skeleton h-40 w-full rounded-2xl" />)}</div>
            ) : members.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/50 px-5 py-8 text-center text-sm text-muted-foreground">
                    No hours {weekStart === thisWeek ? 'yet this week' : 'that week'}. Punches show up here as soon as your crew clocks in.
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                    {members.map(m => (
                        <MemberCard
                            key={`${m.memberId}:${weekStart}`}
                            week={m}
                            weekDaysList={week.days}
                            name={memberById.get(m.memberId)?.name || 'Former crew member'}
                            rate={memberById.get(m.memberId)?.costRate ?? null}
                            jobs={jobs}
                            data={data}
                            rule={rule}
                            today={today}
                            isOnline={isOnline}
                            busy={busy}
                            onEdit={setEditing}
                            onAdd={() => setAdding(m.memberId)}
                            onApprove={() => void approve(m)}
                            onTimeSheets={() => void makeTimeSheets(m)}
                            onOpenTimeSheet={onOpenTimeSheet}
                        />
                    ))}
                </div>
            )}
            {quiet.length > 0 && (
                <p className="text-xs text-muted-foreground">
                    No hours from {quiet.slice(0, 4).map(m => m.name).join(', ')}{quiet.length > 4 ? ` and ${quiet.length - 4} more` : ''}.{' '}
                    {isOnline && <button type="button" className="font-semibold text-primary" onClick={() => setAdding(quiet[0].id)}>Add a shift for {quiet[0].name.split(' ')[0]}</button>}
                </p>
            )}

            {editing && editingMember && (
                <ShiftEditor session={editing} memberName={editingMember.name} jobs={jobsFor(editing.memberId)} onClose={() => setEditing(null)}
                    onDone={(c) => { applyChange(c); setEditing(null); toast.success('Shift saved.'); }} />
            )}
            {adding && addingMember && (
                <AddShift memberId={adding} memberName={addingMember.name} jobs={jobsFor(adding)} defaultDay={weekStart === thisWeek ? today : weekStart}
                    defaultJobId={data.assignments.find(a => a.memberId === adding)?.jobId}
                    onClose={() => setAdding(null)} onDone={(added) => { applyChange({ updated: [], added, removed: [] }); setAdding(null); toast.success('Shift added.'); }} />
            )}
        </div>
    );
};

export default CrewHours;
