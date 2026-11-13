import React, { useEffect, useRef, useState } from 'react';
import { SparklesIcon, XCircleIcon, RefreshCwIcon, StarIcon } from './Icons.tsx';
import AIVoiceInput from './AIVoiceInput.tsx';
import { useContractorAI, type AIGeneratedDocument } from '../src/hooks/useContractorAI.ts';
import { resolveFormType } from '../src/config/docTypeMap.ts';
import { dispatchUpgradeEvent } from '../src/ai/events.ts';

interface AIDocumentModalProps {
    jobId: string;
    /** FormType value or legacy spelling ("WorkOrder", "ChangeOrder"). */
    formTypeRestriction?: string;
    /** Ignored: the AI never saves; the form saves when the user presses Save. */
    saveToDb?: boolean;
    onClose: () => void;
    /** docs[0].data is Partial<TypeData> with exact form field names. */
    onSuccess: (newDocuments: AIGeneratedDocument[], inputText?: string) => void;
}

/**
 * "Fill with AI" inside a form: the user describes the work, the AI fills this form's fields
 * (only the facts given), and the user reviews everything before saving.
 */
export const AIDocumentModal: React.FC<AIDocumentModalProps> = ({ jobId, formTypeRestriction, onClose, onSuccess }) => {
    const { processAIData, cancel, isProcessing, error, errorCode } = useContractorAI();
    const [input, setInput] = useState('');
    const inputRef = useRef(input);
    inputRef.current = input;
    const label = resolveFormType(formTypeRestriction || '') || 'document';

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { cancel(); onClose(); } };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [cancel, onClose]);

    const generate = async () => {
        if (!input.trim() || isProcessing) return;
        const docs = await processAIData(input, formTypeRestriction, jobId);
        if (docs?.length) onSuccess(docs, input);
    };

    const close = () => { cancel(); onClose(); };

    return (
        <div className="modal-backdrop z-[210]" onClick={close}>
            <div className="modal-panel sm:max-w-xl" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Fill ${label} with AI`}>
                <div className="flex items-start gap-3 border-b border-border px-5 py-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
                        <SparklesIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-base font-semibold">Fill this {String(label).toLowerCase()} with AI</h2>
                        <p className="text-sm text-muted-foreground">Describe the job in your own words. I only fill in what you tell me, and you can edit everything before saving.</p>
                    </div>
                    <button type="button" onClick={close} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted">
                        <XCircleIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="space-y-3 px-5 py-4">
                    <div className="flex items-start gap-3">
                        <textarea
                            className="input min-h-[140px] flex-1 text-[15px]"
                            placeholder="e.g. Replaced 2 exterior doors at $450 each, 6 hours labor at $75, due in 30 days"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void generate(); } }}
                            disabled={isProcessing}
                            autoFocus
                        />
                        <AIVoiceInput
                            variant="compact"
                            disabled={isProcessing}
                            onTranscript={text => setInput(prev => prev + (prev && !/\s$/.test(prev) ? ' ' : '') + text)}
                        />
                    </div>
                    {error && (
                        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground" role="alert">
                            {error}
                            {errorCode === 'PLAN_LIMIT' && (
                                <button type="button" onClick={() => dispatchUpgradeEvent(error)} className="ml-2 inline-flex items-center gap-1 font-semibold text-primary">
                                    <StarIcon className="h-3.5 w-3.5" /> See plans
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
                    <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={() => void generate()} disabled={isProcessing || !input.trim()}>
                        {isProcessing ? <RefreshCwIcon className="h-4 w-4 animate-spin" /> : <SparklesIcon className="h-4 w-4" />}
                        {isProcessing ? 'Filling…' : 'Fill the form'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AIDocumentModal;
