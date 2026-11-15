/**
 * Job page > Documents: a compact "Warranties" list above the document tiles when the job has a warranty. Grouped as
 * Ending soon / Active / Ended / Void, each line shows the end date, time left and an "open claims" badge; tapping opens
 * the warranty. "All jobs" shows the same list for the whole account (from the last copy on this device when offline).
 *
 * "This job" is worked out from the documents the page already holds (works offline, no extra request).
 *
 *   <WarrantiesStrip documents={documents} jobId={job.id} onOpen={onOpenDocument} />
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FormData as FormDataType } from '../../types.ts';
import { loadWarranties, type WarrantyListItem } from '../../lib/warranty/warrantyApi.ts';
import {
    openClaimsText, overviewOfDocument, refreshOverview, warrantyBuckets, warrantySummary, type SummaryTone,
} from '../../lib/warranty/warrantyView.ts';
import { readListCopy, saveListCopy, isOfflineFailure } from '../../lib/offline/deviceCache.ts';
import { todayYMD } from '../../utils/localDates.ts';
import { cn } from '../../lib/utils.ts';
import { ChevronRightIcon } from '../Icons.tsx';

interface Item {
    id: string;
    jobId: string | null;
    number: string;
    clientName: string;
    overview: WarrantyListItem['overview'];
    form?: FormDataType;
}

const RULE: Record<SummaryTone, string> = { good: 'bg-success', warn: 'bg-warning', bad: 'bg-destructive', muted: 'bg-border' };
const TEXT: Record<SummaryTone, string> = { good: 'text-muted-foreground', warn: 'text-warning', bad: 'text-destructive', muted: 'text-muted-foreground' };
const COPY_KEY = 'warranties:all';

const WarrantiesStrip: React.FC<{
    documents: FormDataType[];
    jobId: string;
    onOpen: (form: FormDataType) => void;
}> = ({ documents, jobId, onOpen }) => {
    const navigate = useNavigate();
    const today = todayYMD();
    const [scope, setScope] = useState<'job' | 'all'>('job');
    const [all, setAll] = useState<Item[] | null>(null);
    const [note, setNote] = useState<string | null>(null);

    const mine = useMemo<Item[]>(() => documents
        .filter(f => String(f.type) === 'Warranty')
        .map(f => {
            const data = (f.data ?? {}) as unknown as Record<string, unknown>;
            return {
                id: f.id,
                jobId: f.jobId,
                number: String(data.warrantyNumber ?? ''),
                clientName: String(data.clientName ?? ''),
                overview: overviewOfDocument(data, f.createdAt, today),
                form: f,
            };
        }), [documents, today]);

    useEffect(() => {
        if (scope !== 'all' || all) return;
        let alive = true;
        (async () => {
            try {
                const rows = await loadWarranties(today);
                const items: Item[] = rows.map(r => ({ id: r.id, jobId: r.jobId, number: r.number, clientName: r.clientName, overview: r.overview }));
                if (!alive) return;
                setAll(items);
                setNote(null);
                void saveListCopy(COPY_KEY, items);
            } catch (e) {
                const copy = isOfflineFailure(e) ? await readListCopy<Item>(COPY_KEY) : null;
                if (!alive) return;
                if (copy?.rows) {
                    setAll(copy.rows.map(r => ({ ...r, overview: refreshOverview(r.overview, today) })));
                    setNote('Offline: the list as last seen on this device.');
                } else {
                    setNote(isOfflineFailure(e) ? "You're offline. The warranties of all jobs show once you're back online." : 'Could not load the warranties.');
                    setScope('job');
                }
            }
        })();
        return () => { alive = false; };
    }, [scope, all, today]);

    if (!mine.length) return null;

    const items = scope === 'all' && all ? all : mine;
    const groups = warrantyBuckets(items);
    const open = (it: Item) => {
        if (it.form && it.jobId === jobId) onOpen(it.form);
        else if (it.jobId) navigate(`/jobs/${encodeURIComponent(it.jobId)}/forms/Warranty/${encodeURIComponent(it.id)}`);
    };
    const loading = scope === 'all' && !all;

    return (
        <section aria-label="Warranties" className="mb-5">
            <div className="mb-1 flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Warranties</h3>
                <div role="radiogroup" aria-label="Which warranties" className="inline-flex rounded-lg bg-muted p-0.5">
                    {([['job', 'This job'], ['all', 'All jobs']] as const).map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={scope === value}
                            onClick={() => setScope(value)}
                            className={cn('min-h-[32px] rounded-md px-3 text-xs font-semibold transition-colors', scope === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            {note && <p className="mb-1 text-xs text-muted-foreground" role="status">{note}</p>}
            {loading ? (
                <div className="space-y-2 py-2" aria-hidden><div className="skeleton h-10 w-full" /><div className="skeleton h-10 w-2/3" /></div>
            ) : (
                groups.map(g => (
                    <div key={g.id} className="mt-1">
                        <p className="pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">{g.label} <span className="font-medium">{g.items.length}</span></p>
                        <ul className="divide-y divide-border">
                            {g.items.map(it => {
                                const s = warrantySummary(it.overview);
                                const claims = openClaimsText(it.overview);
                                return (
                                    <li key={it.id} className="relative">
                                        <span aria-hidden className={cn('absolute bottom-2.5 left-0 top-2.5 w-0.5 rounded-full', RULE[s.tone])} />
                                        <button type="button" onClick={() => open(it)} className="flex min-h-[52px] w-full items-center justify-between gap-3 py-2 pl-3 pr-1 text-left hover:bg-muted/40">
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-semibold text-foreground">
                                                    {it.number || 'Warranty'}{it.clientName ? <span className="font-normal text-muted-foreground"> · {it.clientName}</span> : null}
                                                </span>
                                                <span className={cn('block truncate text-xs', TEXT[s.tone])}>{s.text}</span>
                                            </span>
                                            <span className="flex shrink-0 items-center gap-2">
                                                {claims && <span className="badge badge-warning">{claims}</span>}
                                                <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))
            )}
        </section>
    );
};

export default WarrantiesStrip;
