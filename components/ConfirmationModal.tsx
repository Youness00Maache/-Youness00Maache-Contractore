import React, { useEffect, useState } from 'react';
import { AlertTriangleIcon, InfoIcon } from './Icons';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** May return a promise: the dialog shows a spinner and closes when it resolves (stays open if it throws). */
    onConfirm: () => void | Promise<unknown>;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    isDestructive?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    isDestructive = false,
}) => {
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!isOpen) { setBusy(false); return; }
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, busy, onClose]);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        setBusy(true);
        try {
            await onConfirm();
            onClose();
        } catch {
            // the caller reports the error (toast); keep the dialog open so the user can retry
        } finally {
            setBusy(false);
        }
    };

    const Icon = isDestructive ? AlertTriangleIcon : InfoIcon;

    return (
        <div className="modal-backdrop z-[110]" onClick={() => { if (!busy) onClose(); }} role="presentation">
            <div
                className="modal-panel p-6"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start gap-4">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${isDestructive ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                        <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 id="confirm-title" className="text-lg font-bold text-foreground">{title}</h2>
                        <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{message}</div>
                    </div>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        className={`btn ${isDestructive ? 'btn-danger' : 'btn-primary'}`}
                        onClick={handleConfirm}
                        disabled={busy}
                        autoFocus
                    >
                        {busy && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
