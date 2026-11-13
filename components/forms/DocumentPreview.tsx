import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FormType, Job, UserProfile } from '../../types.ts';
import { renderDocument } from '../../utils/templates/index.ts';
import { DownloadIcon, EyeIcon, XCircleIcon } from '../Icons.tsx';
import { Spinner } from './Spinner.tsx';

interface DocumentPreviewModalProps {
    open: boolean;
    onClose: () => void;
    formType: FormType;
    data: unknown;
    profile: UserProfile;
    job?: Job;
    onDownload?: () => void;
    downloading?: boolean;
}

/**
 * Shows exactly what the PDF will look like (same renderer as the PDF), scaled to the screen.
 * The HTML is rendered in a sandboxed iframe with scripts disabled.
 */
export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({ open, onClose, formType, data, profile, job, onDownload, downloading }) => {
    const frameWrapRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    const rendered = useMemo(() => {
        if (!open) return null;
        try {
            return { result: renderDocument(formType, data, profile, job), error: '' };
        } catch (e) {
            return { result: null, error: e instanceof Error ? e.message : 'Preview unavailable.' };
        }
    }, [open, formType, data, profile, job]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        const el = frameWrapRef.current;
        const ro = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => setWidth(el.clientWidth)) : null;
        if (el) { setWidth(el.clientWidth); ro?.observe(el); }
        return () => { window.removeEventListener('keydown', onKey); ro?.disconnect(); };
    }, [open, onClose]);

    if (!open) return null;
    const pageWidth = rendered?.result?.page.width || 816;
    const scale = width ? Math.min(1, width / pageWidth) : 1;
    const frameHeight = 1600;

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-panel flex h-[92vh] flex-col sm:max-w-4xl" role="dialog" aria-modal="true" aria-labelledby="preview-title" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                    <h3 id="preview-title" className="flex items-center gap-2 text-lg font-semibold"><EyeIcon className="h-5 w-5 text-primary" /> Preview</h3>
                    <div className="flex items-center gap-2">
                        {onDownload && (
                            <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={onDownload} disabled={downloading}>
                                {downloading ? <><Spinner /> Creating…</> : <><DownloadIcon className="h-4 w-4" /> Download PDF</>}
                            </button>
                        )}
                        <button type="button" className="btn btn-ghost h-10 w-10 p-0" onClick={onClose} aria-label="Close preview"><XCircleIcon className="h-5 w-5" /></button>
                    </div>
                </div>
                <div ref={frameWrapRef} className="flex-1 overflow-y-auto bg-muted/60">
                    {rendered?.error ? (
                        <p className="p-6 text-sm text-destructive">The preview could not be created: {rendered.error}</p>
                    ) : rendered?.result ? (
                        <div style={{ height: frameHeight * scale, width: '100%', overflow: 'hidden' }}>
                            <iframe
                                title="Document preview"
                                sandbox=""
                                srcDoc={rendered.result.html}
                                style={{ width: pageWidth, height: frameHeight, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', background: 'transparent' }}
                            />
                        </div>
                    ) : null}
                </div>
                <p className="border-t border-border px-5 py-2 text-xs text-muted-foreground">This is how the PDF will look. Long documents continue on more pages.</p>
            </div>
        </div>
    );
};

/** Header action that opens the preview. */
export const PreviewButton: React.FC<{ onClick: () => void; compact?: boolean }> = ({ onClick, compact }) => (
    <button type="button" className={`btn btn-outline ${compact ? 'btn-sm min-h-[40px]' : ''}`} onClick={onClick}>
        <EyeIcon className="h-4 w-4" /> Preview
    </button>
);
