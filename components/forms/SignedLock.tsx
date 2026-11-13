import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FormType, Job } from '../../types.ts';
import { cn } from '../../lib/utils.ts';
import { LockIcon } from '../Icons.tsx';
import { regenerateApprovalToken } from '../../utils/clientLinks.ts';
import { formatDate } from '../../utils/templates/format.ts';
import { ConfirmDialog } from './FormShell.tsx';
import { Spinner } from './Spinner.tsx';
import { makeSeedPrefill, type DocumentFormApi } from './useDocumentForm.ts';
import { todayISO } from './formUtils.ts';
import { fetchServerSignature } from './jobDocuments.ts';
import {
    CLIENT_SIGNATURE_KEYS, buildRevisionSeed, docLabelOf, isClientSigned, revisionNumber, signedOnLabel, signerOf, unsignedPatch,
    type SignableKind,
} from './signedLock.ts';

/**
 * Read-only wrapper for the sections of a signed document. A disabled <fieldset> disables every input, select,
 * textarea and button inside it (keyboard included); pointer events are off so canvases (signature pad) stay
 * untouched. Values stay fully readable.
 */
export const LockedFieldset: React.FC<{ locked: boolean; className?: string; children: React.ReactNode }> = ({ locked, className, children }) => (
    <fieldset
        disabled={locked}
        className={cn(
            'm-0 min-w-0 border-0 p-0',
            locked && 'pointer-events-none select-text [&_.input:disabled]:cursor-default [&_.input:disabled]:bg-muted/40 [&_.input:disabled]:opacity-100',
            className,
        )}
    >
        {children}
    </fieldset>
);

/** "Signed by X on date — locked" with the Revise action (and optional extra actions, e.g. Convert to invoice). */
export const SignedLockBanner: React.FC<{ data: unknown; kind: SignableKind; onRevise: () => void; actions?: React.ReactNode }> = ({ data, kind, onRevise, actions }) => {
    const on = signedOnLabel(data);
    return (
        <div role="status" className="flex flex-col gap-3 rounded-2xl border border-success/30 bg-card px-4 py-3 shadow-soft sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2.5">
                <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Signed by {signerOf(data)}{on ? ` on ${on}` : ''} — locked</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        This is the version the client approved, so it can’t be edited. To change it, revise it: the new version needs a new client signature.
                    </p>
                </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
                {actions}
                <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={onRevise}>Revise</button>
            </div>
        </div>
    );
};

/**
 * Async save check: refuses to save over a document the client signed while it was open here (the database would
 * keep the signature next to the new numbers).
 */
export const makeSignatureCheck = (kind: SignableKind, getId: () => string | undefined) =>
    async (_next: unknown, lastSaved: unknown): Promise<string | null> => {
        const id = getId();
        if (!id || isClientSigned(lastSaved)) return null;
        const server = await fetchServerSignature(id);
        if (!server?.signedAt) return null;
        const on = formatDate(server.signedAt, { locale: 'en-US' });
        return `The client${server.signedBy ? ` (${server.signedBy})` : ''} signed this ${docLabelOf(kind)}${on ? ` on ${on}` : ''} while it was open here, so these changes were not saved. Go back and open it again to see the signed version; use “Revise” to change it.`;
    };

interface SignedLockOptions<T extends object> {
    form: DocumentFormApi<T>;
    kind: SignableKind;
    formType: FormType;
    job: Job;
    documentId?: string;
    numberKey: string;
}

/**
 * Lock state + "Revise" flow of a signed estimate / change order:
 *  - New revision: opens a NEW Draft copy (number -R2, today's date, no signature, `revisionOf` link); this signed
 *    document stays unchanged as the record of what was approved.
 *  - Unlock this one (after a confirm): clears the signature, sets Draft, saves, and issues a new approval link
 *    (the old one was used by the signature).
 */
export function useSignedLock<T extends object>({ form, kind, formType, job, documentId, numberKey }: SignedLockOptions<T>) {
    const navigate = useNavigate();
    const locked = isClientSigned(form.data);
    const [reviseOpen, setReviseOpen] = useState(false);
    const [unlockOpen, setUnlockOpen] = useState(false);
    const [busy, setBusy] = useState<'' | 'revision' | 'unlock'>('');
    const [newToken, setNewToken] = useState<string | null>(null);
    const label = docLabelOf(kind);
    const number = String((form.data as Record<string, unknown>)[numberKey] || '');

    useEffect(() => { if (!locked) setReviseOpen(false); }, [locked]);

    const createRevision = async () => {
        if (busy) return;
        setBusy('revision');
        try {
            if (form.isDirty && !(await form.save())) return; // e.g. a design change: keep it
            const seed = buildRevisionSeed(form.data, kind, documentId ?? form.lastSaveResult?.id, todayISO());
            setReviseOpen(false);
            navigate(`/jobs/${job.id}/forms/${encodeURIComponent(formType)}`, { state: { prefillData: makeSeedPrefill(seed), fromJob: true } });
        } finally {
            setBusy('');
        }
    };

    const unlockInPlace = async () => {
        if (busy) return;
        setBusy('unlock');
        setUnlockOpen(false);
        setReviseOpen(false);
        const before = form.data as Record<string, unknown>;
        const restore: Record<string, unknown> = { status: before.status };
        for (const k of CLIENT_SIGNATURE_KEYS) restore[k] = before[k];
        try {
            form.update(prev => ({ ...prev, ...unsignedPatch() }) as T);
            if (!(await form.save())) {
                form.update(prev => ({ ...prev, ...restore }) as T); // not saved: stay locked
                return;
            }
            const id = documentId ?? form.lastSaveResult?.id;
            if (id) {
                try {
                    setNewToken(await regenerateApprovalToken(id));
                } catch {
                    form.setFeedback({ tone: 'error', message: `Unlocked, but a new approval link could not be created. Use “Copy approval link” before sending the ${label} again.` });
                    return;
                }
            }
            form.setFeedback({ tone: 'success', message: `Unlocked: this ${label} is a Draft again. Send the new approval link so the client can sign the changes.` });
        } finally {
            setBusy('');
        }
    };

    const dialogs = (
        <>
            {reviseOpen && (
                <div className="modal-backdrop" onClick={() => !busy && setReviseOpen(false)}>
                    <div className="modal-panel p-6" role="dialog" aria-modal="true" aria-labelledby="revise-title" onClick={e => e.stopPropagation()}>
                        <h3 id="revise-title" className="text-lg font-semibold text-foreground">Revise {number || `this ${label}`}</h3>
                        <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                            <p>
                                <span className="font-semibold text-foreground">New revision (recommended).</span>{' '}
                                Creates {revisionNumber(number) || 'a copy'} as a Draft with the same lines. This signed {label} stays unchanged as the record of what the client approved.
                            </p>
                            <p>
                                <span className="font-semibold text-foreground">Unlock this {label}.</span>{' '}
                                Removes the client’s signature and sets it back to Draft so you can edit it. The signed version is not kept.
                            </p>
                        </div>
                        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button type="button" className="btn btn-outline" onClick={() => setReviseOpen(false)} disabled={Boolean(busy)}>Cancel</button>
                            <button type="button" className="btn btn-secondary" onClick={() => setUnlockOpen(true)} disabled={Boolean(busy)}>Unlock this one</button>
                            <button type="button" className="btn btn-primary" onClick={() => void createRevision()} disabled={Boolean(busy)}>
                                {busy === 'revision' ? <><Spinner /> Opening…</> : 'Create revision'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <ConfirmDialog
                open={unlockOpen}
                title="Remove the client’s signature?"
                message={`${signerOf(form.data)} signed this ${label}${signedOnLabel(form.data) ? ` on ${signedOnLabel(form.data)}` : ''}. Unlocking removes that signature and sets it back to Draft; the client must sign the new version with a new approval link. This can’t be undone.`}
                confirmLabel="Remove signature and unlock"
                cancelLabel="Cancel"
                destructive
                onConfirm={() => void unlockInPlace()}
                onCancel={() => setUnlockOpen(false)}
            />
        </>
    );

    return {
        locked,
        unlocking: busy === 'unlock',
        /** approval token issued after an unlock (the ApprovalSection shows the new link) */
        newToken,
        openRevise: () => setReviseOpen(true),
        dialogs,
    };
}
