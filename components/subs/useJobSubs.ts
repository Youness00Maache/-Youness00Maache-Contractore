/**
 * Data hooks of the job Subs tab (components/subs/*): a job's subcontract commitments and quotes, and the account's crew
 * members with their kind (worker / subcontractor). They load, keep the list current while the contractor works and read again
 * when the connection is back. No Supabase writes here (those are in lib/subs/subsApi.ts).
 *
 *   const c = useJobCommitments(jobId, online);  const q = useJobQuotes(jobId, online);
 *   c.items   undefined = loading, null = the feature is not in the database, else the list
 *   c.error / c.ready / c.reload() / c.upsert(...saved) / c.remove(id)
 *
 *   const m = useSubMembers(enabled, online);
 *   m.members   SubMember[] | null (null until loaded)   m.subs  the subcontractors that are not archived
 *   m.byId      Map id -> SubMember                       m.reload() / m.set(member)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { describeError } from '../../lib/account.ts';
import { listJobCommitments, listJobQuotes, listSubMembers, subsFeature } from '../../lib/subs/subsApi.ts';
import { sortCommitments } from '../../lib/subs/subLogic.ts';
import type { JobQuote, SubCommitment, SubMember } from '../../lib/subs/subTypes.ts';

export interface JobListState<T> {
    items: T[] | null | undefined;
    error: string;
    ready: boolean;
    reload: () => Promise<void>;
    upsert: (...saved: T[]) => void;
    remove: (id: string) => void;
}

function useJobList<T extends { id: string }>(
    jobId: string,
    online: boolean,
    load: (jobId: string) => Promise<T[] | null>,
    sort: (list: T[]) => T[],
    failText: string,
): JobListState<T> {
    const [items, setItems] = useState<T[] | null | undefined>(undefined);
    const [error, setError] = useState('');
    const [ready, setReady] = useState(false);
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const loadRef = useRef(load);
    loadRef.current = load;
    const sortRef = useRef(sort);
    sortRef.current = sort;

    const reload = useCallback(async () => {
        try {
            const list = await loadRef.current(jobId);
            if (!alive.current) return;
            if (list === null) { subsFeature.markMissing(); setItems(null); return; }
            setItems(list);
            setError('');
            setReady(true);
        } catch (e) {
            if (!alive.current) return;
            setError(describeError(e, failText));
            setItems(prev => (prev === undefined ? [] : prev));
        }
    }, [jobId, failText]);

    useEffect(() => { setItems(undefined); setReady(false); void reload(); }, [reload]);
    // the connection is back: read again
    const wasOnline = useRef(online);
    useEffect(() => { if (online && !wasOnline.current) void reload(); wasOnline.current = online; }, [online, reload]);

    const upsert = useCallback((...saved: T[]) => {
        setItems(prev => {
            const cur = Array.isArray(prev) ? prev : [];
            const ids = new Set(saved.map(s => s.id));
            return sortRef.current([...cur.filter(s => !ids.has(s.id)), ...saved]);
        });
    }, []);
    const remove = useCallback((id: string) => {
        setItems(prev => (Array.isArray(prev) ? prev.filter(s => s.id !== id) : prev));
    }, []);

    return { items, error, ready, reload, upsert, remove };
}

const sortQuotes = (list: JobQuote[]): JobQuote[] => [...list].sort((a, b) => a.scopeKey.localeCompare(b.scopeKey) || a.amount - b.amount);

export const useJobCommitments = (jobId: string, online: boolean): JobListState<SubCommitment> =>
    useJobList<SubCommitment>(jobId, online, listJobCommitments, sortCommitments, 'The subcontracts could not be loaded.');

export const useJobQuotes = (jobId: string, online: boolean): JobListState<JobQuote> =>
    useJobList<JobQuote>(jobId, online, listJobQuotes, sortQuotes, 'The quotes could not be loaded.');

// ------------------------------------------------------------------------------------------------ members
export interface SubMembersState {
    members: SubMember[] | null;
    subs: SubMember[];
    byId: Map<string, SubMember>;
    reload: () => Promise<void>;
    set: (member: SubMember) => void;
}

export function useSubMembers(enabled: boolean, online = true): SubMembersState {
    const [members, setMembers] = useState<SubMember[] | null>(null);
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const reload = useCallback(async () => {
        if (!enabled) return;
        try {
            const list = await listSubMembers();
            if (alive.current && list) setMembers(list);
        } catch { /* the crew screen keeps working without the kinds */ }
    }, [enabled]);
    useEffect(() => { void reload(); }, [reload]);
    const wasOnline = useRef(online);
    useEffect(() => { if (online && !wasOnline.current) void reload(); wasOnline.current = online; }, [online, reload]);
    const set = useCallback((member: SubMember) => {
        setMembers(prev => {
            const cur = prev || [];
            return cur.some(m => m.id === member.id) ? cur.map(m => (m.id === member.id ? member : m)) : [...cur, member].sort((a, b) => a.name.localeCompare(b.name));
        });
    }, []);
    const byId = useMemo(() => new Map((members || []).map(m => [m.id, m])), [members]);
    const subs = useMemo(() => (members || []).filter(m => m.kind === 'subcontractor' && m.active), [members]);
    return { members, subs, byId, reload, set };
}
