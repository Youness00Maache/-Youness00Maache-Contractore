import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SearchIcon, XCircleIcon } from './Icons.tsx';
import type { FormData as FormDataType, Job } from '../types.ts';
import { getDocumentTitle } from '../lib/documents.ts';
import { rankJobsForPicker, type CopyTargetJob } from '../lib/copyToJob.ts';

interface CopyToJobModalProps {
    form: FormDataType | null;
    jobs: CopyTargetJob[];
    /** latest document date per job, for "recent first" */
    lastActivity?: Record<string, string | undefined>;
    onClose: () => void;
    /** May return a promise; the sheet shows progress on the chosen job. */
    onCopy: (job: CopyTargetJob) => void | Promise<unknown>;
}

const STATUS_LABEL: Record<Job['status'], string> = { active: 'Active', completed: 'Completed', inactive: 'Inactive', paused: 'Paused' };

/** Compact job picker: bottom sheet on phones, dialog on larger screens. */
export const CopyToJobModal: React.FC<CopyToJobModalProps> = ({ form, jobs, lastActivity, onClose, onCopy }) => {
    const [query, setQuery] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!form) return;
        setQuery('');
        setBusyId(null);
        const t = setTimeout(() => inputRef.current?.focus(), 50);
        return () => clearTimeout(t);
    }, [form?.id]);

    useEffect(() => {
        if (!form) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyId) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [form, busyId, onClose]);

    const list = useMemo(
        () => (form ? rankJobsForPicker(jobs, { excludeJobId: form.jobId, query, lastActivity }) : []),
        [form, jobs, query, lastActivity],
    );

    if (!form) return null;

    const pick = async (job: CopyTargetJob) => {
        if (busyId) return;
        setBusyId(job.id);
        try { await onCopy(job); } finally { setBusyId(null); }
    };

    return (
        <div className="modal-backdrop z-[110]" onClick={() => { if (!busyId) onClose(); }} role="presentation">
            <div className="modal-panel flex max-h-[85vh] flex-col overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="copy-job-title" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                    <div className="min-w-0">
                        <h2 id="copy-job-title" className="text-lg font-bold">Copy to another job</h2>
                        <p className="truncate text-xs text-muted-foreground">{getDocumentTitle(form)} is copied as a draft you can edit.</p>
                    </div>
                    <button type="button" onClick={onClose} disabled={Boolean(busyId)} className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
                        <XCircleIcon className="h-5 w-5" />
                    </button>
                </div>
                <div className="border-b border-border px-5 py-3">
                    <div className="relative">
                        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            ref={inputRef}
                            type="search"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search by job or client"
                            aria-label="Search jobs"
                            className="input pl-9"
                        />
                    </div>
                </div>
                <ul className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto" aria-label="Jobs">
                    {list.map(job => (
                        <li key={job.id}>
                            <button
                                type="button"
                                onClick={() => pick(job)}
                                disabled={Boolean(busyId)}
                                className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-muted disabled:opacity-60"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold text-foreground">{job.name}</span>
                                    <span className="block truncate text-xs text-muted-foreground">{[job.clientName, STATUS_LABEL[job.status]].filter(Boolean).join(' · ')}</span>
                                </span>
                                <span className="shrink-0 text-xs font-medium text-primary">{busyId === job.id ? 'Copying...' : 'Copy here'}</span>
                            </button>
                        </li>
                    ))}
                    {list.length === 0 && (
                        <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                            {query ? 'No job matches your search.' : 'You have no other job to copy this into.'}
                        </li>
                    )}
                </ul>
            </div>
        </div>
    );
};

export default CopyToJobModal;
