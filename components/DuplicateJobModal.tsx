import React, { useState, useEffect, useRef } from 'react';
import { XCircleIcon, CopyIcon } from './Icons';
import { Job, Client, FormData } from '../types';
import { getDocumentTitle } from '../lib/documents.ts';

interface DuplicateJobModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** May return a promise; the modal shows progress and stays open if it throws. */
    onDuplicate: (jobName: string, clientId: string | null, clientName: string, selectedDocIds: string[]) => void | Promise<unknown>;
    job: Job | null;
    forms: FormData[];
    clients: Client[];
    /** True while the job's documents are still being loaded. */
    loadingDocuments?: boolean;
    /** Free plan: new documents a job may get this month (the first ones selected are copied). null = no limit. */
    copyLimit?: number | null;
}

export const DuplicateJobModal: React.FC<DuplicateJobModalProps> = ({
    isOpen,
    onClose,
    onDuplicate,
    job,
    forms,
    clients,
    loadingDocuments = false,
    copyLimit = null,
}) => {
    const [jobName, setJobName] = useState('');
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const initializedForRef = useRef<string | null>(null);
    const docsInitializedRef = useRef(false);

    // Initialize only when the modal opens for a job (CORE-026: re-renders must not reset what the user typed).
    useEffect(() => {
        if (!isOpen || !job) {
            initializedForRef.current = null;
            docsInitializedRef.current = false;
            return;
        }
        if (initializedForRef.current === job.id) return;
        initializedForRef.current = job.id;
        docsInitializedRef.current = false;
        setJobName(`${job.name} (Copy)`);
        const clientMatch = clients.find(c => c.name === job.clientName);
        setSelectedClientId(clientMatch ? clientMatch.id : '');
        setBusy(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, job?.id]);

    // Select all documents once they have loaded.
    useEffect(() => {
        if (!isOpen || !job || loadingDocuments || docsInitializedRef.current) return;
        docsInitializedRef.current = true;
        setSelectedDocIds(new Set(forms.map(f => f.id)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, job?.id, loadingDocuments, forms.length]);

    if (!isOpen || !job) return null;

    const handleToggleDoc = (docId: string) => {
        setSelectedDocIds(prev => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId); else next.add(docId);
            return next;
        });
    };

    const handleSubmit = async () => {
        const client = clients.find(c => c.id === selectedClientId);
        setBusy(true);
        try {
            await onDuplicate(
                jobName.trim(),
                client ? client.id : null,
                client ? client.name : job.clientName,
                forms.filter(f => selectedDocIds.has(f.id)).map(f => f.id),
            );
        } catch {
            // caller shows the error; keep the modal open
        } finally {
            setBusy(false);
        }
    };

    const allSelected = forms.length > 0 && forms.every(f => selectedDocIds.has(f.id));

    return (
        <div className="modal-backdrop z-[110]" onClick={() => { if (!busy) onClose(); }} role="presentation">
            <div className="modal-panel flex flex-col" role="dialog" aria-modal="true" aria-labelledby="dup-title" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <h2 id="dup-title" className="flex items-center gap-2 text-lg font-bold">
                        <CopyIcon className="h-5 w-5 text-primary" />
                        Duplicate job
                    </h2>
                    <button type="button" onClick={onClose} disabled={busy} className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
                        <XCircleIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="space-y-4 overflow-y-auto px-5 py-5">
                    <div>
                        <label htmlFor="dup-name" className="label">New job name</label>
                        <input id="dup-name" type="text" value={jobName} onChange={(e) => setJobName(e.target.value)} className="input" />
                    </div>
                    <div>
                        <label htmlFor="dup-client" className="label">Client</label>
                        <select id="dup-client" value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className="input">
                            <option value="">{job.clientName ? `Same as original (${job.clientName})` : 'No client'}</option>
                            {clients.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="border-t border-border pt-4">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="label mb-0">Copy documents</span>
                            {forms.length > 0 && (
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-primary hover:underline"
                                    onClick={() => setSelectedDocIds(allSelected ? new Set() : new Set(forms.map(f => f.id)))}
                                >
                                    {allSelected ? 'Select none' : 'Select all'}
                                </button>
                            )}
                        </div>
                        {loadingDocuments ? (
                            <div className="space-y-2" aria-busy="true">
                                {[0, 1, 2].map(i => <div key={i} className="skeleton h-12 w-full rounded-xl" />)}
                            </div>
                        ) : forms.length === 0 ? (
                            <p className="rounded-xl bg-muted px-3 py-3 text-sm text-muted-foreground">This job has no documents. Only the job will be copied.</p>
                        ) : (
                            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                                {forms.map(form => (
                                    <label key={form.id} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2 transition hover:bg-muted">
                                        <input
                                            type="checkbox"
                                            checked={selectedDocIds.has(form.id)}
                                            onChange={() => handleToggleDoc(form.id)}
                                            className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
                                        />
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">{getDocumentTitle(form)}</p>
                                            <p className="text-xs text-muted-foreground">{form.type}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}
                        {copyLimit !== null && selectedDocIds.size > copyLimit && (
                            <p role="status" className="mt-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground">
                                Free plan: a job can get {copyLimit} new documents a month, so the first {copyLimit} selected (from the top of the list) will be copied and the other {selectedDocIds.size - copyLimit} left out. Untick some to choose, or upgrade to copy them all.
                            </p>
                        )}
                        <p className="mt-2 text-xs text-muted-foreground">Copies start as drafts, without client signatures or approvals.</p>
                    </div>
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={!jobName.trim() || busy || loadingDocuments}>
                        {busy && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
                        {busy ? 'Duplicating...' : 'Duplicate'}
                    </button>
                </div>
            </div>
        </div>
    );
};
