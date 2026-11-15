/**
 * Small shared pieces of the job Tasks screens (components/tasks/*): the status ring, the progress rail, hooks that
 * load a job's tasks / the crew names / a done photo, and a few tiny icons. No Supabase writes here (those are in
 * lib/tasks/tasksApi.ts).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.ts';
import { describeError } from '../../lib/account.ts';
import { isCrewBackendMissing } from '../../lib/crew/crewLogic.ts';
import { listJobTasks, taskPhotoUrl } from '../../lib/tasks/tasksApi.ts';
import { markTasksMissing } from '../../lib/tasks/taskFeature.ts';
import { isOverdue, sortTasks } from '../../lib/tasks/taskLogic.ts';
import type { JobTask, TaskStatus } from '../../lib/tasks/taskTypes.ts';
import { CheckIcon } from '../Icons.tsx';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export const newId = (): string => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);

/** Same sentence as lib/offline/connection.ts, for the places that explain it before the user taps. */
export const TASKS_NEED_CONNECTION = "You're offline. Tasks need a connection; they come back when you're online again.";

export const TASKS_PREMIUM_REASON = 'Job tasks, the timeline and task templates are part of Premium.';

// ------------------------------------------------------------------------------------------------ status ring
/**
 * The mark at the start of a row. A task is a ring (or a diamond for a milestone):
 * hollow = to do, half-filled = in progress, bar through it = blocked / waiting, solid green with a tick = done.
 */
export const StatusRing: React.FC<{ status: TaskStatus; milestone?: boolean; late?: boolean }> = ({ status, milestone = false, late = false }) => {
    const shape = milestone ? 'rotate-45 rounded-[5px]' : 'rounded-full';
    const size = milestone ? 'h-[18px] w-[18px]' : 'h-[22px] w-[22px]';
    if (status === 'done') {
        return (
            <span className={cx('flex items-center justify-center bg-success text-white', shape, size)}>
                <CheckIcon className={cx('h-3 w-3', milestone && '-rotate-45')} />
            </span>
        );
    }
    const edge = late ? 'border-destructive' : status === 'blocked' ? 'border-warning' : status === 'doing' ? 'border-primary' : 'border-muted-foreground/55';
    return (
        <span className={cx('relative block border-2 bg-background', shape, size, edge)}>
            {status === 'doing' && <span className={cx('absolute inset-0 overflow-hidden', shape)}><span className="absolute inset-y-0 left-0 w-1/2 bg-primary" /></span>}
            {status === 'blocked' && <span className="absolute inset-x-[3px] top-1/2 h-[2px] -translate-y-1/2 rounded bg-warning" />}
        </span>
    );
};

// ------------------------------------------------------------------------------------------------ progress rail
/** done (green) · in progress (blue) · to do (grey) · late (red), over the whole width. */
export const TaskRail: React.FC<{ tasks: readonly JobTask[]; today: string; className?: string }> = ({ tasks, today, className = '' }) => {
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const late = tasks.filter(t => isOverdue(t, today)).length;
    const doing = tasks.filter(t => t.status === 'doing' && !isOverdue(t, today)).length;
    const w = (n: number) => (total ? `${(n / total) * 100}%` : '0%');
    return (
        <span className={cx('flex h-1.5 overflow-hidden rounded-full bg-muted', className)} aria-hidden>
            <span className="bg-success" style={{ width: w(done) }} />
            <span className="bg-primary" style={{ width: w(doing) }} />
            <span className="bg-destructive/80" style={{ width: w(late) }} />
        </span>
    );
};

// ------------------------------------------------------------------------------------------------ tiny icons
const Stroke: React.FC<React.SVGProps<SVGSVGElement>> = (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p} />
);
export const ArrowUpIcon = (p: React.SVGProps<SVGSVGElement>) => <Stroke {...p}><path d="m18 15-6-6-6 6" /></Stroke>;
export const ArrowDownIcon = (p: React.SVGProps<SVGSVGElement>) => <Stroke {...p}><path d="m6 9 6 6 6-6" /></Stroke>;
export const GripIcon = (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
        <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
    </svg>
);

/** A small diamond (milestone marker) in the current text colour. */
export const Diamond: React.FC<{ className?: string; filled?: boolean }> = ({ className = '', filled = true }) => (
    <span aria-hidden className={cx('inline-block h-2.5 w-2.5 rotate-45 rounded-[2px]', filled ? 'bg-current' : 'border-[1.5px] border-current', className)} />
);

// ------------------------------------------------------------------------------------------------ crew names
export interface CrewPerson { id: string; name: string; active: boolean }

let crewCache: { at: number; people: CrewPerson[] } | null = null;

/** The account's crew members (for "assigned to"). Quiet: a missing crew feature or an error just means no names. */
export function useCrewPeople(enabled: boolean): { people: CrewPerson[]; loaded: boolean } {
    const [people, setPeople] = useState<CrewPerson[]>(() => crewCache?.people || []);
    const [loaded, setLoaded] = useState(Boolean(crewCache));
    useEffect(() => {
        if (!enabled) return;
        if (crewCache && Date.now() - crewCache.at < 60_000) { setPeople(crewCache.people); setLoaded(true); return; }
        let alive = true;
        void (async () => {
            try {
                const { data, error } = await supabase.from('crew_members').select('id, name, active').order('name', { ascending: true }).limit(300);
                if (error) { if (!isCrewBackendMissing(error as any)) throw error; if (alive) setLoaded(true); return; }
                const list = ((data || []) as Array<Record<string, unknown>>).map(r => ({ id: String(r.id), name: String(r.name || ''), active: r.active !== false })).filter(p => p.id && p.name);
                crewCache = { at: Date.now(), people: list };
                if (alive) { setPeople(list); setLoaded(true); }
            } catch {
                if (alive) setLoaded(true);
            }
        })();
        return () => { alive = false; };
    }, [enabled]);
    return { people, loaded };
}

// ------------------------------------------------------------------------------------------------ a job's tasks
export interface JobTasksState {
    /** undefined = loading, null = the feature is not in the database */
    tasks: JobTask[] | null | undefined;
    setTasks: React.Dispatch<React.SetStateAction<JobTask[] | null | undefined>>;
    error: string;
    /** the first read worked (until then an error means "could not load", not "no tasks") */
    ready: boolean;
    reload: () => Promise<void>;
    /** adds or replaces tasks (by id), keeping the manual order */
    upsert: (...saved: JobTask[]) => void;
    remove: (id: string) => void;
}

export function useJobTasks(jobId: string, online: boolean): JobTasksState {
    const [tasks, setTasks] = useState<JobTask[] | null | undefined>(undefined);
    const [error, setError] = useState('');
    const [ready, setReady] = useState(false);
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

    const reload = useCallback(async () => {
        try {
            const list = await listJobTasks(jobId);
            if (!alive.current) return;
            if (list === null) { markTasksMissing(); setTasks(null); return; }
            setTasks(sortTasks(list));
            setError('');
            setReady(true);
        } catch (e) {
            if (!alive.current) return;
            setError(describeError(e, 'Your tasks could not be loaded.'));
            setTasks(prev => (prev === undefined ? [] : prev));
        }
    }, [jobId]);

    useEffect(() => { setTasks(undefined); setReady(false); void reload(); }, [reload]);
    // the connection is back: read them again
    const wasOnline = useRef(online);
    useEffect(() => { if (online && !wasOnline.current) void reload(); wasOnline.current = online; }, [online, reload]);

    const upsert = useCallback((...saved: JobTask[]) => {
        setTasks(prev => {
            const cur = Array.isArray(prev) ? prev : [];
            const ids = new Set(saved.map(s => s.id));
            return sortTasks([...cur.filter(t => !ids.has(t.id)), ...saved]);
        });
    }, []);
    const remove = useCallback((id: string) => {
        setTasks(prev => (Array.isArray(prev) ? prev.filter(t => t.id !== id).map(t => (t.dependsOn.includes(id) ? { ...t, dependsOn: t.dependsOn.filter(d => d !== id) } : t)) : prev));
    }, []);
    return { tasks, setTasks, error, ready, reload, upsert, remove };
}

// ------------------------------------------------------------------------------------------------ done photo
const photoCache = new Map<string, { url: string; at: number }>();

/** Signed URL of the worker's done photo ('' while loading or when there is none). */
export function useTaskPhoto(path: string | null | undefined): string {
    const [url, setUrl] = useState(() => (path ? photoCache.get(path)?.url || '' : ''));
    useEffect(() => {
        if (!path) { setUrl(''); return; }
        const hit = photoCache.get(path);
        if (hit && Date.now() - hit.at < 45 * 60_000) { setUrl(hit.url); return; }
        let alive = true;
        void taskPhotoUrl(path).then(u => {
            if (!alive || !u) return;
            photoCache.set(path, { url: u, at: Date.now() });
            setUrl(u);
        }).catch(() => undefined);
        return () => { alive = false; };
    }, [path]);
    return url;
}
