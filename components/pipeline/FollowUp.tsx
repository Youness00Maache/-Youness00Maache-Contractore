/**
 * Follow-up from a pipeline card, with the app's existing windows:
 *   - FollowUpShare: the Share window of the document (Send with Gmail, links, text / WhatsApp, PDF),
 *   - RemindersSheet: the document's automatic reminders (on/off, planned dates, why nothing goes out).
 * Both load the full document first (the board only reads summaries).
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { Client, FormData as FormDataType, Job, UserProfile } from '../../types.ts';
import { fetchFullDocument } from '../../lib/documents.ts';
import type { PipelineDoc } from '../../lib/pipeline.ts';
import ShareModal from '../ShareModal.tsx';
import DocumentRemindersPanel from '../reminders/DocumentRemindersPanel.tsx';
import { InlineError, Modal, friendlyError } from '../viewKit.tsx';

const useFullDocument = (doc: PipelineDoc | null) => {
    const [full, setFull] = useState<FormDataType | null>(null);
    const [error, setError] = useState('');
    const load = useCallback(() => {
        if (!doc) return () => undefined;
        let active = true;
        setFull(null);
        setError('');
        fetchFullDocument(doc.id)
            .then(f => { if (active) setFull(f); })
            .catch(e => { if (active) setError(friendlyError(e, 'Could not load the document.')); });
        return () => { active = false; };
    }, [doc]);
    useEffect(() => load(), [load]);
    return { full, error, retry: load };
};

const Loading: React.FC = () => (
    <div className="space-y-3 py-2" aria-busy="true" aria-label="Loading">
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton h-4 w-1/2" />
        <div className="skeleton h-24 w-full" />
    </div>
);

export const FollowUpShare: React.FC<{
    doc: PipelineDoc | null;
    job?: Job;
    profile: UserProfile;
    clients: Client[];
    onClose: () => void;
}> = ({ doc, job, profile, clients, onClose }) => {
    const { full, error, retry } = useFullDocument(doc);
    if (!doc) return null;
    if (!full) {
        return (
            <Modal open onClose={onClose} title="Follow up" description={[doc.number, doc.clientName].filter(Boolean).join(' · ') || undefined} size="md">
                {error ? <InlineError onRetry={retry}>{error}</InlineError> : <Loading />}
            </Modal>
        );
    }
    const data = full.data as any;
    const pdf = async (getBlob: boolean): Promise<string> => {
        const { generateDocumentPDF } = await import('../../services/pdfGenerator.ts');
        return generateDocumentPDF(full.type, data, profile, job, data?.templateId, getBlob, { createdAt: full.createdAt });
    };
    return (
        <ShareModal
            isOpen
            onClose={onClose}
            data={data}
            docType={full.type}
            profile={profile}
            documentId={full.id}
            publicToken={full.public_token}
            clients={clients}
            job={job}
            onDownload={() => pdf(false)}
            getPdfDataUri={async () => String((await pdf(true)) || '')}
        />
    );
};

export const RemindersSheet: React.FC<{
    doc: PipelineDoc | null;
    clientId?: string | null;
    title: string;
    onClose: () => void;
}> = ({ doc, clientId, title, onClose }) => {
    const { full, error, retry } = useFullDocument(doc);
    if (!doc) return null;
    const type = /invoice/i.test(doc.type) ? 'Invoice' : 'Estimate';
    return (
        <Modal
            open
            onClose={onClose}
            size="lg"
            title={`Reminders · ${title}`}
            description={type === 'Invoice'
                ? 'Payment reminders go out from your Gmail on your schedule (Settings › Reminders) and stop when it is paid.'
                : 'Follow-ups go out from your Gmail on your schedule (Settings › Reminders) and stop when the client answers.'}
            footer={<button type="button" className="btn btn-primary" onClick={onClose}>Done</button>}
        >
            {error ? <InlineError onRetry={retry}>{error}</InlineError> : full ? (
                <DocumentRemindersPanel type={type} documentId={full.id} data={full.data as Record<string, any>} clientId={clientId ?? null} />
            ) : <Loading />}
        </Modal>
    );
};
