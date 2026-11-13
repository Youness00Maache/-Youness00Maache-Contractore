import React, { useState } from 'react';
import { ShareIcon } from '../Icons.tsx';
import { Spinner } from './Spinner.tsx';
import type { DocumentFormApi } from './useDocumentForm.ts';

/**
 * "Share" header action. Like the original app it saves first (new document or unsaved edits), so a brand-new
 * document can be emailed / linked right away. A missing required field keeps the share window closed (the form
 * shows what to fix); any other save problem still opens it so the PDF can be downloaded or shared from the phone.
 */
const ShareButton: React.FC<{ ensureSaved: DocumentFormApi<object>['ensureSaved']; onOpen: () => void }> = ({ ensureSaved, onOpen }) => {
    const [busy, setBusy] = useState(false);
    const click = async () => {
        if (busy) return;
        setBusy(true);
        try {
            if ((await ensureSaved()) !== 'invalid') onOpen();
        } finally {
            setBusy(false);
        }
    };
    return (
        <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={click} disabled={busy} aria-busy={busy}>
            {busy ? <Spinner /> : <ShareIcon className="h-4 w-4" />} {busy ? 'Saving…' : 'Share'}
        </button>
    );
};

export default ShareButton;
