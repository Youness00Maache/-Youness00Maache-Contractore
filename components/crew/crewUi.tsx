/**
 * Small shared pieces of the owner's crew screens (Crew page, job Crew tab): flag chips, the "on the clock" dot,
 * the account's overtime choice and the data hooks.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    addDays, dayStartMs, distanceLabel, durationLabel, isOvertimeRule, punchLocationFlag, type JobSite, type OvertimeRule, type Punch,
    type WorkSession,
} from '../../lib/crew/crewLogic.ts';
import { CrewUnavailableError, loadCrewData, loadPunches, type CrewData } from '../../lib/crew/crewApi.ts';
import { markCrewMissing } from '../../lib/crew/crewFeature.ts';
import { readAccountSetting, writeAccountSetting } from '../../lib/userData.ts';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

// ------------------------------------------------------------------------------------------------------- chips
type ChipTone = 'warning' | 'danger' | 'muted' | 'success';
const CHIP: Record<ChipTone, string> = {
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-destructive/10 text-destructive',
    muted: 'bg-muted text-muted-foreground',
    success: 'bg-success/10 text-success',
};

export const Chip: React.FC<{ tone: ChipTone; children: React.ReactNode; title?: string }> = ({ tone, children, title }) => (
    <span title={title} className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-4 ${CHIP[tone]}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{children}
    </span>
);

export interface ShiftChip { key: string; tone: ChipTone; label: string; title?: string }

/** What needs a look on a shift: missing punches, long shift, edits, and each punch's location vs the job's pin. */
export const shiftChips = (s: WorkSession, site: JobSite | null | undefined): ShiftChip[] => {
    const chips: ShiftChip[] = [];
    if (s.flags.includes('missing_out')) chips.push({ key: 'mo', tone: 'danger', label: s.open ? 'Missed clock-out' : 'No clock-out', title: 'Not counted until you add the clock-out.' });
    if (s.flags.includes('missing_in')) chips.push({ key: 'mi', tone: 'danger', label: 'No clock-in', title: 'Not counted until you add the clock-in.' });
    if (s.flags.includes('long_shift')) chips.push({ key: 'long', tone: 'warning', label: 'Long shift', title: 'Over 16 hours: probably a forgotten clock-out.' });
    if (s.flags.includes('stray_break')) chips.push({ key: 'brk', tone: 'muted', label: 'Break taps mixed up' });
    let far: number | null = null;
    let noLoc = 0;
    for (const p of s.punches) {
        const f = punchLocationFlag(p, site);
        if (f.flag === 'far') far = Math.max(far ?? 0, f.distanceM || 0);
        if (f.flag === 'no_location') noLoc++;
    }
    if (far !== null) chips.push({ key: 'far', tone: 'warning', label: `Far from job · ${distanceLabel(far)}`, title: 'A punch was outside the job site’s radius.' });
    if (noLoc) chips.push({ key: 'noloc', tone: 'muted', label: 'No location', title: 'The worker didn’t share a location for this punch (or the phone couldn’t get one).' });
    if (s.flags.includes('edited')) chips.push({ key: 'ed', tone: 'muted', label: 'Edited' });
    return chips;
};

export const LiveDot: React.FC<{ tone?: 'success' | 'warning' | 'danger' }> = ({ tone = 'success' }) => (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0" aria-hidden>
        <span className={cx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-destructive')} />
        <span className={cx('relative inline-flex h-2.5 w-2.5 rounded-full', tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-destructive')} />
    </span>
);

/** "On the clock 3h 12m" / "On break" / "Missed clock-out" for a running shift. */
export const openShiftLabel = (s: WorkSession): { text: string; tone: 'success' | 'warning' | 'danger' } => {
    if (s.flags.includes('missing_out')) return { text: 'Missed clock-out', tone: 'danger' };
    if (s.breaks.some(b => b.end === null)) return { text: 'On break', tone: 'warning' };
    return { text: `On the clock ${durationLabel(s.liveMs)}`, tone: 'success' };
};

// ------------------------------------------------------------------------------------------------------- settings
export const CREW_SETTINGS_KEY = 'crew.settings';
const LOCAL_KEY = 'cd.crew.settings';

/** The account's overtime rule (public.user_settings 'crew.settings'; device copy for a fast first paint). */
export const useOvertimeRule = (): [OvertimeRule, (r: OvertimeRule) => void] => {
    const [rule, setRule] = useState<OvertimeRule>(() => {
        try { const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}')?.overtime; return isOvertimeRule(v) ? v : 'weekly40'; } catch { return 'weekly40'; }
    });
    useEffect(() => {
        let alive = true;
        void readAccountSetting(CREW_SETTINGS_KEY).then(({ mode, value }) => {
            const v = mode === 'account' && value && typeof value === 'object' ? (value as { overtime?: unknown }).overtime : null;
            if (alive && isOvertimeRule(v)) {
                setRule(v);
                try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ overtime: v })); } catch { /* ignore */ }
            }
        }).catch(() => undefined);
        return () => { alive = false; };
    }, []);
    const save = useCallback((r: OvertimeRule) => {
        setRule(r);
        try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ overtime: r })); } catch { /* ignore */ }
        void writeAccountSetting(CREW_SETTINGS_KEY, { overtime: r, updatedAt: new Date().toISOString() });
    }, []);
    return [rule, save];
};

// ------------------------------------------------------------------------------------------------------- data
export interface CrewDataState {
    data: CrewData | null;
    loading: boolean;
    error: string | null;
    unavailable: boolean;
    reload: () => Promise<void>;
    setData: React.Dispatch<React.SetStateAction<CrewData | null>>;
}

export const useCrewData = (enabled: boolean): CrewDataState => {
    const [data, setData] = useState<CrewData | null>(null);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState<string | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const reload = useCallback(async () => {
        if (!enabled) return;
        setLoading(true);
        try {
            setData(await loadCrewData());
            setError(null);
        } catch (e) {
            if (e instanceof CrewUnavailableError) { setUnavailable(true); markCrewMissing(); }
            else setError((e as Error)?.message || 'Could not load your crew.');
        } finally {
            setLoading(false);
        }
    }, [enabled]);
    useEffect(() => { void reload(); }, [reload]);
    return { data, loading, error, unavailable, reload, setData };
};

/**
 * Punches around a week (two days either side, so a shift that crosses midnight into or out of the week pairs
 * correctly), optionally of one job. `reloadKey` re-reads.
 */
export const useWeekPunches = (weekStart: string, enabled: boolean, opts: { jobId?: string; reloadKey?: unknown } = {}) => {
    const [punches, setPunches] = useState<Punch[]>([]);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState<string | null>(null);
    const seq = useRef(0);
    const reload = useCallback(async () => {
        if (!enabled) return;
        const mine = ++seq.current;
        setLoading(true);
        try {
            const from = new Date(dayStartMs(addDays(weekStart, -2))).toISOString();
            const to = new Date(dayStartMs(addDays(weekStart, 9))).toISOString();
            const rows = await loadPunches({ from, to, jobId: opts.jobId });
            if (mine === seq.current) { setPunches(rows); setError(null); }
        } catch (e) {
            if (e instanceof CrewUnavailableError) markCrewMissing();
            if (mine === seq.current) setError((e as Error)?.message || 'Could not load the hours.');
        } finally {
            if (mine === seq.current) setLoading(false);
        }
    }, [enabled, weekStart, opts.jobId]);
    useEffect(() => { void reload(); }, [reload, opts.reloadKey]);
    return { punches, setPunches, loading, error, reload };
};
