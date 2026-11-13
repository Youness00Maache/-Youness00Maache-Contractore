import React, { useEffect, useState } from 'react';
import SignaturePad, { getDefaultSignature, setDefaultSignature } from './SignaturePad.tsx';
import { PenIcon, XCircleIcon } from './Icons.tsx';
import { supabase } from '../lib/supabase.ts';

interface SetupSignatureModalProps {
    initialDataUrl?: string;
    onClose: () => void;
    /** receives a PNG data URL; it is attached only to the document being created */
    onSave: (dataUrl: string) => void;
    /** current user id (used for "my saved signature"); looked up from the session when omitted */
    userId?: string;
    title?: string;
    description?: string;
}

/** Renders typed text as a signature-style PNG (transparent background, trimmed). */
export const typedSignatureToDataUrl = (text: string): string => {
    const value = text.trim();
    if (!value || typeof document === 'undefined') return '';
    const font = '64px "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive';
    const measure = document.createElement('canvas').getContext('2d');
    if (!measure) return '';
    measure.font = font;
    const width = Math.min(1400, Math.ceil(measure.measureText(value).width) + 48);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.font = font;
    ctx.fillStyle = '#111827';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, 24, 62, width - 48);
    return canvas.toDataURL('image/png');
};

const SetupSignatureModal: React.FC<SetupSignatureModalProps> = ({
    initialDataUrl, onClose, onSave, userId, title = 'Add your signature', description = 'It is added only to the document you are creating now.',
}) => {
    const [mode, setMode] = useState<'draw' | 'type'>('draw');
    const [drawn, setDrawn] = useState(initialDataUrl || '');
    const [typed, setTyped] = useState('');
    const [ownerKey, setOwnerKey] = useState<string | undefined>(userId);
    const [rememberAsDefault, setRememberAsDefault] = useState(false);

    useEffect(() => {
        if (userId) { setOwnerKey(userId); return; }
        let active = true;
        supabase.auth.getSession().then(({ data }) => {
            if (active && data.session?.user?.id) setOwnerKey(data.session.user.id);
        }).catch(() => undefined);
        return () => { active = false; };
    }, [userId]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const savedDefault = getDefaultSignature(ownerKey);
    const result = mode === 'draw' ? drawn : typedSignatureToDataUrl(typed);
    const canSave = mode === 'draw' ? Boolean(drawn) : Boolean(typed.trim());

    const handleSave = () => {
        if (!result) return;
        if (rememberAsDefault) setDefaultSignature(ownerKey, result);
        onSave(result);
        onClose();
    };

    return (
        <div className="modal-backdrop z-[80]" onClick={onClose}>
            <div
                className="modal-panel p-5 sm:max-w-2xl"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="setup-signature-title"
            >
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <PenIcon className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 id="setup-signature-title" className="text-lg font-semibold text-foreground">{title}</h3>
                            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="btn btn-ghost h-10 w-10 shrink-0 p-0" aria-label="Close">
                        <XCircleIcon className="h-5 w-5" />
                    </button>
                </div>

                <div role="tablist" aria-label="Signature method" className="mb-4 inline-flex rounded-xl border border-border bg-muted p-1">
                    {(['draw', 'type'] as const).map(m => (
                        <button
                            key={m}
                            type="button"
                            role="tab"
                            aria-selected={mode === m}
                            onClick={() => setMode(m)}
                            className={`min-h-[36px] rounded-lg px-4 text-sm font-semibold transition-colors ${mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            {m === 'draw' ? 'Draw' : 'Type'}
                        </button>
                    ))}
                </div>

                {mode === 'draw' ? (
                    <SignaturePad initialDataUrl={drawn} onSave={setDrawn} onClear={() => setDrawn('')} defaultSignatureKey={ownerKey} />
                ) : (
                    <div className="space-y-3">
                        <label className="label" htmlFor="typed-signature">Your full name</label>
                        <input
                            id="typed-signature"
                            type="text"
                            value={typed}
                            onChange={e => setTyped(e.target.value)}
                            placeholder="e.g. Jordan Mitchell"
                            className="input"
                            autoFocus
                        />
                        <div className="flex h-28 items-center justify-center rounded-xl border border-border bg-white px-4 dark:bg-zinc-100">
                            {typed.trim() ? (
                                <span className="truncate text-4xl text-zinc-900" style={{ fontFamily: '"Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive' }}>{typed}</span>
                            ) : (
                                <span className="text-sm text-zinc-400">Preview</span>
                            )}
                        </div>
                    </div>
                )}

                {ownerKey && result && result !== savedDefault && (
                    <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                        <input type="checkbox" className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]" checked={rememberAsDefault} onChange={e => setRememberAsDefault(e.target.checked)} />
                        Also save as my default signature on this device
                    </label>
                )}

                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onClose} className="btn btn-outline">Cancel</button>
                    <button type="button" disabled={!canSave} onClick={handleSave} className="btn btn-primary">Use this signature</button>
                </div>
            </div>
        </div>
    );
};

export default SetupSignatureModal;
