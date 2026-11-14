import React, { useState } from 'react';
import type { FormType } from '../../types.ts';
import { SparklesIcon } from '../Icons.tsx';
import { AIDocumentModal } from '../AIDocumentModal.tsx';

/**
 * "AI fill" header action. The AI result goes through the same normalizer as router prefill
 * (mergeDraftIntoForm), so every returned field lands in its matching input.
 */
const AIFillButton: React.FC<{
    jobId: string;
    formType: FormType;
    onApply: (payload: unknown) => void;
    compact?: boolean;
    /** the form's current data (Estimate: "turn this into good / better / best options" builds on its lines) */
    formData?: unknown;
}> = ({ jobId, formType, onApply, compact, formData }) => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" className={`btn btn-outline ${compact ? 'btn-sm min-h-[40px]' : ''}`} onClick={() => setOpen(true)} title="Fill this document with AI">
                <SparklesIcon className="h-4 w-4 text-primary" /> AI fill
            </button>
            {open && (
                <AIDocumentModal
                    jobId={jobId}
                    formTypeRestriction={formType}
                    formData={formData}
                    saveToDb={false}
                    onClose={() => setOpen(false)}
                    onSuccess={(docs: any[]) => {
                        setOpen(false);
                        const doc = Array.isArray(docs) ? docs[0] : null;
                        const payload = doc?.form_payload ?? doc?.data ?? doc;
                        if (payload) onApply(payload);
                    }}
                />
            )}
        </>
    );
};

export default AIFillButton;
