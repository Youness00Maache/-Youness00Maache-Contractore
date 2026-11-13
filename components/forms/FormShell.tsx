import React, { useEffect, useState } from 'react';
import type { FormType, Job, UserProfile } from '../../types.ts';
import { cn } from '../../lib/utils.ts';
import { BackArrowIcon, CheckCircleIcon, AlertTriangleIcon, SparklesIcon, XCircleIcon, DownloadIcon, SaveIcon } from '../Icons.tsx';
import type { FormFeedback } from './useDocumentForm.ts';
import { Spinner } from './Spinner.tsx';
import { DocumentPreviewModal, PreviewButton } from './DocumentPreview.tsx';

export { Spinner };

const STATUS_TONES: Record<string, string> = {
    draft: 'badge-muted',
    sent: 'badge-primary',
    submitted: 'badge-primary',
    scheduled: 'badge-primary',
    'in progress': 'badge-warning',
    'on hold': 'badge-warning',
    overdue: 'badge-danger',
    cancelled: 'badge-danger',
    rejected: 'badge-danger',
    paid: 'badge-success',
    accepted: 'badge-success',
    approved: 'badge-success',
    completed: 'badge-success',
    received: 'badge-success',
};

export const StatusBadge: React.FC<{ status?: string | null; className?: string }> = ({ status, className }) => {
    if (!status) return null;
    const tone = STATUS_TONES[String(status).toLowerCase()] || 'badge-muted';
    return <span className={cn('badge', tone, className)}>{status}</span>;
};

export const ConfirmDialog: React.FC<{
    open: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel: string;
    cancelLabel?: string;
    destructive?: boolean;
    extraAction?: { label: string; onClick: () => void; disabled?: boolean };
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ open, title, message, confirmLabel, cancelLabel = 'Keep editing', destructive, extraAction, onConfirm, onCancel }) => {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel]);
    if (!open) return null;
    return (
        <div className="modal-backdrop" onClick={onCancel}>
            <div className="modal-panel p-6" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={e => e.stopPropagation()}>
                <h3 id="confirm-title" className="text-lg font-semibold text-foreground">{title}</h3>
                <div className="mt-2 text-sm text-muted-foreground">{message}</div>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" className="btn btn-outline" onClick={onCancel}>{cancelLabel}</button>
                    {extraAction && (
                        <button type="button" className="btn btn-secondary" onClick={extraAction.onClick} disabled={extraAction.disabled}>{extraAction.label}</button>
                    )}
                    <button type="button" className={cn('btn', destructive ? 'btn-danger' : 'btn-primary')} onClick={onConfirm}>{confirmLabel}</button>
                </div>
            </div>
        </div>
    );
};

export const FeedbackBanner: React.FC<{ feedback: FormFeedback | null; onDismiss: () => void }> = ({ feedback, onDismiss }) => {
    if (!feedback) return null;
    const Icon = feedback.tone === 'success' ? CheckCircleIcon : feedback.tone === 'error' ? AlertTriangleIcon : SparklesIcon;
    return (
        <div
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            className={cn(
                'flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-soft animate-fade-in-down',
                feedback.tone === 'success' && 'border-success/30 bg-card text-success',
                feedback.tone === 'error' && 'border-destructive/30 bg-card text-destructive',
                feedback.tone === 'info' && 'border-primary/25 bg-card text-foreground',
            )}
        >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', feedback.tone === 'info' && 'text-primary')} />
            <p className="min-w-0 flex-1 font-medium">{feedback.message}</p>
            <button type="button" onClick={onDismiss} className="-m-1 rounded-lg p-1 opacity-70 hover:opacity-100" aria-label="Dismiss message">
                <XCircleIcon className="h-4 w-4" />
            </button>
        </div>
    );
};

export interface FormShellProps {
    title: string;
    subtitle?: React.ReactNode;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    status?: string | null;
    aiGenerated?: boolean;
    isDirty: boolean;
    saving: boolean;
    downloading: boolean;
    justSaved?: boolean;
    feedback: FormFeedback | null;
    onDismissFeedback: () => void;
    onBack: () => void;
    onSave: () => void;
    onDownload: () => void;
    onSaveAndDownload?: () => void;
    /** extra header actions (share, AI fill, ...) */
    actions?: React.ReactNode;
    /** enables the "Preview" action (same renderer as the PDF) */
    preview?: { formType: FormType; data: unknown; profile: UserProfile; job?: Job };
    saveLabel?: string;
    children: React.ReactNode;
}

/**
 * Shared layout for all 12 document forms: sticky header (back, title, status, primary actions),
 * feedback banner, content column of cards, sticky action bar on phones and an unsaved-changes guard.
 */
export const FormShell: React.FC<FormShellProps> = ({
    title, subtitle, icon: Icon, status, aiGenerated, isDirty, saving, downloading, justSaved, feedback, onDismissFeedback,
    onBack, onSave, onDownload, onSaveAndDownload, actions, preview, saveLabel = 'Save', children,
}) => {
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const busy = saving || downloading;

    const requestBack = () => {
        if (isDirty) setConfirmLeave(true);
        else onBack();
    };

    // Ctrl/Cmd+S saves
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                if (!busy) onSave();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [busy, onSave]);

    const saveButtonContent = saving
        ? (<><Spinner /> Saving…</>)
        : justSaved && !isDirty
            ? (<><CheckCircleIcon className="h-4 w-4" /> Saved</>)
            : (<><SaveIcon className="h-4 w-4" /> {saveLabel}</>);
    const downloadButtonContent = downloading ? (<><Spinner /> Creating PDF…</>) : (<><DownloadIcon className="h-4 w-4" /> PDF</>);
    const secondary = (
        <>
            {actions}
            {preview && <PreviewButton compact onClick={() => setPreviewOpen(true)} />}
        </>
    );
    const hasSecondary = Boolean(actions || preview);

    return (
        <div className="min-h-screen w-full bg-background text-foreground">
            <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
                <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
                    <button type="button" onClick={requestBack} className="btn btn-ghost h-10 w-10 shrink-0 p-0" aria-label="Back to job">
                        <BackArrowIcon className="h-5 w-5" />
                    </button>
                    <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
                        <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                            <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">{title}</h1>
                            <StatusBadge status={status} className="shrink-0" />
                            {aiGenerated && (
                                <span className="badge badge-primary hidden shrink-0 sm:inline-flex"><SparklesIcon className="h-3 w-3" /> AI draft</span>
                            )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                            {isDirty ? <span className="font-medium text-warning">Unsaved changes</span> : subtitle}
                        </p>
                    </div>
                    <div className="hidden items-center gap-2 md:flex">{secondary}</div>
                    <div className="hidden items-center gap-2 sm:flex">
                        <button type="button" className="btn btn-outline" onClick={onDownload} disabled={busy}>{downloadButtonContent}</button>
                        {onSaveAndDownload && (
                            <button type="button" className="btn btn-secondary hidden xl:inline-flex" onClick={onSaveAndDownload} disabled={busy}>
                                Save &amp; PDF
                            </button>
                        )}
                        <button type="button" className="btn btn-primary min-w-[96px]" onClick={onSave} disabled={busy}>{saveButtonContent}</button>
                    </div>
                </div>
                {hasSecondary && (
                    <div className="mx-auto flex w-full max-w-5xl items-center gap-2 overflow-x-auto px-4 pb-3 sm:px-6 md:hidden">{secondary}</div>
                )}
            </header>

            <main className="mx-auto w-full max-w-5xl space-y-6 px-4 pb-32 pt-6 sm:px-6 sm:pb-16">
                {feedback && (
                    <div className="sticky top-[5.5rem] z-20 md:top-[4.75rem]">
                        <FeedbackBanner feedback={feedback} onDismiss={onDismissFeedback} />
                    </div>
                )}
                {children}
            </main>

            {/* phone action bar */}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 pt-3 backdrop-blur sm:hidden" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}>
                <div className="flex gap-2">
                    <button type="button" className="btn btn-outline h-11 flex-1" onClick={onDownload} disabled={busy}>{downloadButtonContent}</button>
                    <button type="button" className="btn btn-primary h-11 flex-[1.6]" onClick={onSave} disabled={busy}>{saveButtonContent}</button>
                </div>
            </div>

            {preview && (
                <DocumentPreviewModal
                    open={previewOpen}
                    onClose={() => setPreviewOpen(false)}
                    formType={preview.formType}
                    data={preview.data}
                    profile={preview.profile}
                    job={preview.job}
                    onDownload={onDownload}
                    downloading={downloading}
                />
            )}

            <ConfirmDialog
                open={confirmLeave}
                title="Leave without saving?"
                message="You have changes that haven't been saved. If you leave now they will be lost."
                confirmLabel="Discard changes"
                destructive
                extraAction={{ label: saving ? 'Saving…' : 'Save', disabled: busy, onClick: () => { setConfirmLeave(false); onSave(); } }}
                onConfirm={() => { setConfirmLeave(false); onBack(); }}
                onCancel={() => setConfirmLeave(false)}
            />
        </div>
    );
};
