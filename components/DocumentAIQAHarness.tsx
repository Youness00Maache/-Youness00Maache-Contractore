import React, { useMemo, useState } from 'react';
import type { Job, UserProfile } from '../types.ts';
import { runLocalMockRouter } from '../src/hooks/useMasterAIRouter.ts';
import { finalizeDraft, toFormPrefill } from '../utils/documentDraft.ts';
import { DOC_LABELS, DOC_TYPES, getSchema, type DocKey } from '../src/config/documentFieldRequirements.ts';

/**
 * DEV-only page (/qa-ai-documents): runs the same router pipeline the edge function uses with
 * AI_PROVIDER=mock, for all 12 document types, and shows the exact prefill each form receives.
 */
const QA_JOB: Job = {
    id: 'qa-job', userId: 'qa-user', name: 'QA Kitchen Remodel', clientName: 'Morgan Client',
    clientAddress: '456 Oak Ave, Test City', startDate: '2026-05-25', endDate: null, status: 'active',
};
const QA_PROFILE: UserProfile = {
    id: 'qa-user', email: 'qa@example.com', name: 'Jordan Mitchell', companyName: 'Atlas Builders QA', logoUrl: '',
    address: '100 Builder Way, Test City', phone: '(555) 010-2000', website: 'atlas-builders.test',
};

export const QA_REQUESTS: Record<DocKey, string> = {
    INVOICE: 'Create an invoice for 2 doors at $450 and 6 hours labor at $75, due December 1, 2026, 8.25% tax',
    ESTIMATE: 'Make an estimate: 1 demo and haul away at $1,200; 120 sq ft of tile at $14, valid until Jan 15, 2027',
    WORK_ORDER: 'Create a work order: replace the kitchen faucet and fix the leak under the sink',
    DAILY_REPORT: 'Daily report: plumbing rough-in on the bathroom, 3 workers, ran 40 feet of PEX. One worker cut his hand, first aid given.',
    TIME_SHEET: 'Create a timesheet for Jordan Mitchell 8 hours and 2 hours overtime',
    MATERIAL_LOG: 'Material log: 20 studs at $8 from City Supply; 4 boxes of screws at $12',
    EXPENSE_LOG: 'Log an expense: $64.50 on gas at Shell',
    WARRANTY: 'Create a warranty: 2 years, covers labor and installation defects',
    NOTE: 'Write a note titled Inspection: call the inspector Monday about the framing',
    RECEIPT: 'Create a receipt for $975 paid by check',
    CHANGE_ORDER: 'Change order: add two exterior doors at $450 each, client request',
    PURCHASE_ORDER: 'Purchase order from City Supply: 40 studs at $6.50 and 10 sheets of drywall at $14',
};

const DocumentAIQAHarness: React.FC = () => {
    const [selected, setSelected] = useState<DocKey>('INVOICE');
    const results = useMemo(() => DOC_TYPES.map(type => {
        const proposal = runLocalMockRouter(QA_REQUESTS[type], 'job', {
            today: '2026-11-12', active_job_id: QA_JOB.id,
            jobs: [{ id: QA_JOB.id, name: QA_JOB.name, client_name: QA_JOB.clientName, address: QA_JOB.clientAddress, status: 'active' }],
        });
        const prefill = proposal.document_type
            ? toFormPrefill(finalizeDraft(proposal.document_type, proposal.prefill, { job: QA_JOB, profile: QA_PROFILE, userText: QA_REQUESTS[type], today: '2026-11-12' }), { draftId: `qa-${type}` })
            : {};
        const schemaKeys = Object.keys(getSchema(type));
        const badKeys = Object.keys(prefill).filter(k => !schemaKeys.includes(k) && k !== '__draftId' && k !== '__autoSave');
        return { type, proposal, prefill, badKeys, ok: proposal.document_type === type && badKeys.length === 0 };
    }), []);
    const current = results.find(r => r.type === selected)!;

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">AI document QA</h1>
                    <p className="page-subtitle">Mock router → normalized prefill for every document type (development only).</p>
                </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
                <ul className="card divide-y divide-border overflow-hidden">
                    {results.map(r => (
                        <li key={r.type}>
                            <button type="button" onClick={() => setSelected(r.type)}
                                className={`flex min-h-[44px] w-full items-center justify-between px-4 py-2 text-left text-sm ${r.type === selected ? 'bg-primary/10 font-semibold' : 'hover:bg-muted'}`}>
                                {DOC_LABELS[r.type]}
                                <span className={`badge ${r.ok ? 'badge-success' : 'badge-danger'}`}>{r.ok ? 'OK' : 'Check'}</span>
                            </button>
                        </li>
                    ))}
                </ul>
                <div className="card card-pad space-y-4">
                    <div>
                        <p className="label">Request</p>
                        <p className="text-sm">{QA_REQUESTS[selected]}</p>
                    </div>
                    <div>
                        <p className="label">Action</p>
                        <p className="text-sm">{current.proposal.action_type} · {current.proposal.reply_text}</p>
                    </div>
                    {current.badKeys.length > 0 && <p className="text-sm text-destructive">Unknown keys: {current.badKeys.join(', ')}</p>}
                    <div>
                        <p className="label">prefillData sent to the {DOC_LABELS[selected]} form</p>
                        <pre className="max-h-[480px] overflow-auto rounded-xl bg-muted p-4 text-xs">{JSON.stringify(current.prefill, null, 2)}</pre>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DocumentAIQAHarness;
