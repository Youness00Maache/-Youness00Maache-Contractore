/**
 * What the automation rules remember (account: public.user_settings, bounded, no new table). PURE.
 *
 *   'automations.seen'  jobs: which jobs were already completed when the rules started watching ("base"), and which
 *                        were seen turning completed afterwards ("fresh", with the time). A job has no completion time
 *                        of its own in the database, so "just completed" is "seen completed and not in the base".
 *   'automations.done'  the drafts a rule made (one entry per source document / job), so the same draft is never made
 *                        twice and the notification "your invoice draft is ready" can be shown again on any device.
 *
 * Both lists are unions when two devices are merged (nothing one device learned is lost) and stay below the 20,000
 * character limit of a user_settings value.
 */
import { notificationKey } from '../notifications/model.ts';

/** A value is checked at 20,000 characters by the database: stay well below it. */
export const STATE_MAX_CHARS = 16_000;
export const SEEN_MAX_BASE = 800;
export const SEEN_MAX_FRESH = 100;
export const DONE_MAX = 60;
/** a made-draft record is kept this long (the bell shows 60 days) */
export const DONE_KEEP_DAYS = 60;

const DAY_MS = 86_400_000;
const sec = (ms: number): number => Math.floor(ms / 1000);

/** Short stable key of "<rule>:<entity id>" (the notification hash, <= 11 characters). */
export const autoKey = (rule: string, entityId: string): string => notificationKey(`${rule}:${entityId}`);

// =====================================================================================================================
// Jobs seen completed
// =====================================================================================================================
export interface SeenJobs {
    v: 1;
    /** epoch seconds the rules started watching (0 = not yet) */
    since: number;
    /** short keys of jobs that were already completed, or seen completed before a rule could react */
    base: string[];
    /** short key -> epoch seconds a job was first seen completed after `since` */
    fresh: Record<string, number>;
}

export const emptySeen = (): SeenJobs => ({ v: 1, since: 0, base: [], fresh: {} });

const KEY_RE = /^[a-z0-9]{1,16}$/;
const goodSec = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e11 ? Math.floor(v) : null);

export const parseSeen = (raw: unknown): SeenJobs => {
    let v: unknown = raw;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return emptySeen();
    const r = v as Record<string, unknown>;
    const base = Array.isArray(r.base) ? Array.from(new Set(r.base.filter((k): k is string => typeof k === 'string' && KEY_RE.test(k)))).slice(0, SEEN_MAX_BASE) : [];
    const fresh: Record<string, number> = {};
    if (r.fresh && typeof r.fresh === 'object' && !Array.isArray(r.fresh)) {
        for (const [k, t] of Object.entries(r.fresh as Record<string, unknown>)) {
            const s = goodSec(t);
            if (KEY_RE.test(k) && s !== null) fresh[k] = s;
        }
    }
    return { v: 1, since: goodSec(r.since) ?? 0, base, fresh: capFresh(fresh) };
};

const capFresh = (fresh: Record<string, number>): Record<string, number> =>
    Object.fromEntries(Object.entries(fresh).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, SEEN_MAX_FRESH));

export const sameSeen = (a: SeenJobs, b: SeenJobs): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Two devices' copies together: the earliest start, every base key, every fresh time (the earliest sighting wins). */
export const mergeSeen = (a: SeenJobs, b: SeenJobs): SeenJobs => {
    const since = a.since && b.since ? Math.min(a.since, b.since) : a.since || b.since;
    const fresh: Record<string, number> = { ...a.fresh };
    for (const [k, t] of Object.entries(b.fresh)) fresh[k] = fresh[k] ? Math.min(fresh[k], t) : t;
    const base = Array.from(new Set([...a.base, ...b.base])).slice(0, SEEN_MAX_BASE);
    return { v: 1, since, base, fresh: capFresh(fresh) };
};

export interface JobStatusInput {
    id: string;
    status: string;
    createdAt?: string | null;
}

/**
 * Follows the jobs list: the first time (`since` = 0) every completed job becomes "base" (nothing already completed is
 * an event); after that a completed job that is neither base nor fresh is recorded as fresh with the time; a job that is
 * no longer completed (or no longer there) is forgotten, so completing it again is a new event.
 * `jobs` must be the whole list (the caller waits until it is loaded). Returns the same object when nothing changed.
 */
export const trackJobs = (seen: SeenJobs, jobs: readonly JobStatusInput[], nowMs: number): SeenJobs => {
    const now = sec(nowMs);
    const completed = jobs.filter(j => j && j.id && String(j.status).toLowerCase() === 'completed');
    const keyOf = (j: JobStatusInput) => autoKey('job', j.id);
    const completedKeys = new Set(completed.map(keyOf));

    let next: SeenJobs;
    if (!seen.since) {
        const newestFirst = [...completed].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        next = { v: 1, since: now, base: Array.from(new Set(newestFirst.map(keyOf))).slice(0, SEEN_MAX_BASE), fresh: {} };
    } else {
        const known = new Set([...seen.base, ...Object.keys(seen.fresh)]);
        const fresh: Record<string, number> = {};
        for (const [k, t] of Object.entries(seen.fresh)) if (completedKeys.has(k)) fresh[k] = t;
        for (const j of completed) {
            const k = keyOf(j);
            if (!known.has(k)) fresh[k] = now;
        }
        const base = seen.base.filter(k => completedKeys.has(k));
        next = { v: 1, since: seen.since, base, fresh: capFresh(fresh) };
    }
    return sameSeen(next, seen) ? seen : next;
};

/** Seconds a job was first seen completed after the rules started watching (null = already completed before, or not completed). */
export const freshCompletedAt = (seen: SeenJobs, jobId: string): number | null => seen.fresh[autoKey('job', jobId)] ?? null;

// =====================================================================================================================
// Drafts a rule made
// =====================================================================================================================
export type DoneKind = 'inv' | 'war';

export interface DoneEntry {
    /** which rule: 'inv' = invoice from an approved estimate, 'war' = warranty for a completed job */
    r: DoneKind;
    /** epoch seconds */
    at: number;
    /** id of the document that was made */
    id: string;
    /** job id the document is filed under */
    jid: string;
    /** its label ("Invoice INV-2026-11-004") */
    l: string;
    /** what it came from ("Estimate EST-2026-11-002", "Kitchen remodel") */
    f: string;
}

export interface DoneLog {
    v: 1;
    done: Record<string, DoneEntry>;
}

export const emptyDone = (): DoneLog => ({ v: 1, done: {} });

const cut = (v: unknown, n: number): string => (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, n);

export const parseDone = (raw: unknown): DoneLog => {
    let v: unknown = raw;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return emptyDone();
    const src = (v as Record<string, unknown>).done;
    const done: Record<string, DoneEntry> = {};
    if (src && typeof src === 'object' && !Array.isArray(src)) {
        for (const [k, e] of Object.entries(src as Record<string, unknown>)) {
            if (!KEY_RE.test(k) || !e || typeof e !== 'object') continue;
            const x = e as Record<string, unknown>;
            const at = goodSec(x.at);
            const id = cut(x.id, 64);
            if ((x.r !== 'inv' && x.r !== 'war') || at === null || !id) continue;
            done[k] = { r: x.r, at, id, jid: cut(x.jid, 64), l: cut(x.l, 60), f: cut(x.f, 60) };
        }
    }
    return pruneDone({ v: 1, done }, Date.now());
};

/** Entries older than DONE_KEEP_DAYS go, then the oldest until DONE_MAX entries and the size limit fit. */
export const pruneDone = (log: DoneLog, nowMs: number): DoneLog => {
    const cutoff = sec(nowMs - DONE_KEEP_DAYS * DAY_MS);
    let entries = Object.entries(log.done).filter(([, e]) => e.at >= cutoff).sort((a, b) => b[1].at - a[1].at || a[0].localeCompare(b[0])).slice(0, DONE_MAX);
    let next: DoneLog = { v: 1, done: Object.fromEntries(entries) };
    while (JSON.stringify(next).length > STATE_MAX_CHARS && entries.length > 5) {
        entries = entries.slice(0, Math.floor(entries.length * 0.8));
        next = { v: 1, done: Object.fromEntries(entries) };
    }
    return next;
};

export const sameDone = (a: DoneLog, b: DoneLog): boolean => JSON.stringify(a) === JSON.stringify(b);

export const mergeDone = (a: DoneLog, b: DoneLog, nowMs: number): DoneLog => {
    const done: Record<string, DoneEntry> = { ...a.done };
    for (const [k, e] of Object.entries(b.done)) if (!done[k] || e.at < done[k].at) done[k] = e;
    return pruneDone({ v: 1, done }, nowMs);
};

export const recordDone = (log: DoneLog, key: string, entry: DoneEntry, nowMs: number): DoneLog =>
    pruneDone({ v: 1, done: { ...log.done, [key]: entry } }, nowMs);
