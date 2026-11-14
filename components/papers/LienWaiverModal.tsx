/**
 * "Lien waiver": conditional / unconditional, progress / final, filled in from the job, one of its invoices and a
 * payment recorded with "Mark as paid". Saved on the job as a Note document (opens in the Note editor, prints and
 * emails like any document). On every plan. Needs a connection.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { Client, FormData as FormDataType, Job, UserProfile } from '../../types.ts';
import { supabase } from '../../lib/supabase.ts';
import { mapDocumentRow, DOCUMENT_DETAIL_COLUMNS } from '../../lib/documents.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import {
    WAIVER_TAG, buildLienWaiverHtml, lienWaiverTitle, waiverCheck, waiverInvoices, waiverPrefill,
    type LienWaiverFields, type WaiverInvoice, type WaiverScope, type WaiverType,
} from '../../lib/lienWaiver.ts';
import { saveJobNote } from '../../lib/noteDocuments.ts';
import { formatMoney } from '../../utils/money.ts';
import { todayYMD } from '../../utils/localDates.ts';
import { describeError } from '../../lib/account.ts';
import { Field, Modal, Segmented } from '../viewKit.tsx';
import { NumberInput } from '../forms/Fields.tsx';

export interface LienWaiverModalProps {
    userId: string;
    profile: UserProfile;
    jobs: Array<Job & { clientId?: string | null }>;
    clients: Client[];
    /** the job to start with (job page); the user can pick another */
    jobId?: string | null;
    isOnline: boolean;
    onClose: () => void;
    /** the waiver was saved: open it */
    onCreated: (form: FormDataType) => void;
}

const LienWaiverModal: React.FC<LienWaiverModalProps> = ({ userId, profile, jobs, clients, jobId: startJob, isOnline, onClose, onCreated }) => {
    const today = todayYMD();
    const activeJobs = useMemo(() => jobs.filter(j => j.status !== 'inactive' || j.id === startJob), [jobs, startJob]);
    const [jobId, setJobId] = useState<string>(startJob || activeJobs[0]?.id || '');
    const [type, setType] = useState<WaiverType>('conditional');
    const [scope, setScope] = useState<WaiverScope>('progress');
    const [invoices, setInvoices] = useState<WaiverInvoice[] | null>(null);
    const [invoiceId, setInvoiceId] = useState<string>('');
    const [paymentId, setPaymentId] = useState<string | null | undefined>(undefined);
    const [fields, setFields] = useState<LienWaiverFields | null>(null);
    const [useSignature, setUseSignature] = useState(Boolean((profile as UserProfile & { defaultSignatureUrl?: string }).defaultSignatureUrl));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const job = jobs.find(j => j.id === jobId) || null;
    const client = job ? ((job.clientId ? clients.find(c => c.id === job.clientId) : undefined) || clients.find(c => c.name === job.clientName) || null) : null;

    // the job's invoices (full documents: totals and payments)
    useEffect(() => {
        if (!jobId) { setInvoices([]); return; }
        let cancelled = false;
        setInvoices(null);
        (async () => {
            const { data } = await supabase.from('documents').select(DOCUMENT_DETAIL_COLUMNS).eq('job_id', jobId).eq('type', 'Invoice').order('created_at', { ascending: false }).limit(100);
            if (cancelled) return;
            const list = waiverInvoices((data || []).map(r => mapDocumentRow(r, true)));
            setInvoices(list);
            setInvoiceId(list[0]?.id || '');
            setPaymentId(undefined);
        })().catch(() => { if (!cancelled) setInvoices([]); });
        return () => { cancelled = true; };
    }, [jobId]);

    const invoice = invoices?.find(i => i.id === invoiceId) || null;

    // refill when the source changes (the user's typed changes are kept until then)
    useEffect(() => {
        if (!job || invoices === null) return;
        setFields(waiverPrefill({ type, scope, job, client, profile: profile as UserProfile & { defaultSignatureUrl?: string }, invoice, paymentId, today }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [job?.id, invoices, invoiceId, paymentId, type, scope]);

    const f = fields;
    const set = <K extends keyof LienWaiverFields>(k: K, v: LienWaiverFields[K]) => setFields(cur => (cur ? { ...cur, [k]: v } : cur));
    const final = f ? { ...f, signatureDataUrl: useSignature ? f.signatureDataUrl : '' } : null;
    const check = final ? waiverCheck(final) : { problems: [], warnings: [] };

    const create = async () => {
        if (!final || !job) return;
        if (!isOnline) { setError(NEEDS_CONNECTION); return; }
        if (check.problems.length) { setError(check.problems[0]); return; }
        setBusy(true);
        setError('');
        try {
            const saved = await saveJobNote({
                userId, job, profile, today,
                title: lienWaiverTitle(final.type, final.scope),
                content: buildLienWaiverHtml(final),
                tags: [WAIVER_TAG],
                extra: { lienWaiver: { type: final.type, scope: final.scope, amount: final.amount, invoiceId: final.invoiceId || null, invoiceNumber: final.invoiceNumber || null, throughDate: final.throughDate || null, paymentDate: final.paymentDate || null } },
            });
            onCreated(saved.form);
        } catch (e) {
            setError(describeError(e, 'The waiver could not be saved.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            size="lg"
            title="Lien waiver"
            description="Filled in from the job, its invoice and the payment. Saved on the job as a document you can print, email or share."
            footer={
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={() => { void create(); }} disabled={busy || !final || !isOnline}>{busy ? 'Saving…' : 'Create waiver'}</button>
                </>
            }
        >
            <div className="space-y-4">
                {!startJob && (
                    <Field label="Job" htmlFor="lw-job">
                        <select id="lw-job" className="input" value={jobId} onChange={(e) => setJobId(e.target.value)}>
                            {activeJobs.map(j => <option key={j.id} value={j.id}>{j.name}{j.clientName ? ` · ${j.clientName}` : ''}</option>)}
                        </select>
                    </Field>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <span className="label">Type</span>
                        <Segmented ariaLabel="Waiver type" value={type} onChange={(v) => setType(v as WaiverType)} options={[{ value: 'conditional', label: 'Conditional' }, { value: 'unconditional', label: 'Unconditional' }]} />
                        <p className="mt-1 text-xs text-muted-foreground">{type === 'conditional' ? 'Takes effect once the payment clears. Safe to send before you are paid.' : 'Says you have been paid. Send it only after the money cleared.'}</p>
                    </div>
                    <div>
                        <span className="label">Payment</span>
                        <Segmented ariaLabel="Payment kind" value={scope} onChange={(v) => setScope(v as WaiverScope)} options={[{ value: 'progress', label: 'Progress' }, { value: 'final', label: 'Final' }]} />
                        <p className="mt-1 text-xs text-muted-foreground">{scope === 'progress' ? 'Covers work through a date only.' : 'The last payment for the whole job.'}</p>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Invoice" htmlFor="lw-invoice" hint={invoices && !invoices.length ? 'No invoice on this job: type the amount below.' : undefined}>
                        <select id="lw-invoice" className="input" value={invoiceId} onChange={(e) => { setInvoiceId(e.target.value); setPaymentId(undefined); }} disabled={!invoices?.length}>
                            {invoices === null && <option>Loading…</option>}
                            {invoices?.map(i => <option key={i.id} value={i.id}>{i.number || 'Invoice'} · {formatMoney(i.total)}{i.status ? ` · ${i.status}` : ''}</option>)}
                            {invoices && invoices.length > 0 && <option value="">None</option>}
                        </select>
                    </Field>
                    <Field label="Payment received" htmlFor="lw-payment">
                        <select id="lw-payment" className="input" value={paymentId === undefined ? (invoice?.payments[invoice.payments.length - 1]?.id || '') : paymentId || ''}
                            onChange={(e) => setPaymentId(e.target.value || null)} disabled={!invoice}>
                            {invoice?.payments.map(p => <option key={p.id} value={p.id}>{formatMoney(p.amount)} · {p.date}{p.method ? ` · ${p.method}` : ''}</option>)}
                            <option value="">{invoice?.payments.length ? 'Not paid yet' : 'No payment recorded'}</option>
                        </select>
                    </Field>
                </div>

                {f && (
                    <>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <Field label="Amount" htmlFor="lw-amount">
                                <NumberInput id="lw-amount" value={f.amount} onValueChange={(v) => set('amount', v)} decimals={2} prefix="$" />
                            </Field>
                            {f.scope === 'progress' && (
                                <Field label="Work through" htmlFor="lw-through">
                                    <input id="lw-through" type="date" className="input" value={f.throughDate} onChange={(e) => set('throughDate', e.target.value)} />
                                </Field>
                            )}
                            <Field label="Payment date" htmlFor="lw-paydate">
                                <input id="lw-paydate" type="date" className="input" value={f.paymentDate} onChange={(e) => set('paymentDate', e.target.value)} />
                            </Field>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Customer (work done for)" htmlFor="lw-customer"><input id="lw-customer" className="input" value={f.customer} onChange={(e) => set('customer', e.target.value)} /></Field>
                            <Field label="Property owner" htmlFor="lw-owner"><input id="lw-owner" className="input" value={f.owner} onChange={(e) => set('owner', e.target.value)} /></Field>
                            <Field label="Paid by (maker of the check)" htmlFor="lw-maker"><input id="lw-maker" className="input" value={f.maker} onChange={(e) => set('maker', e.target.value)} /></Field>
                            <Field label="Job location" htmlFor="lw-location"><input id="lw-location" className="input" value={f.jobLocation} onChange={(e) => set('jobLocation', e.target.value)} /></Field>
                        </div>
                        {f.scope === 'progress' ? (
                            <Field label="Exceptions (optional)" htmlFor="lw-exceptions" hint="e.g. retention, unpaid change order CO-3">
                                <input id="lw-exceptions" className="input" value={f.exceptions} onChange={(e) => set('exceptions', e.target.value)} maxLength={300} />
                            </Field>
                        ) : (
                            <Field label="Disputed extra work (optional)" htmlFor="lw-disputed">
                                <NumberInput id="lw-disputed" value={f.disputedAmount || ''} onValueChange={(v) => set('disputedAmount', v)} decimals={2} prefix="$" placeholder="0.00" />
                            </Field>
                        )}
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Signed by" htmlFor="lw-signer"><input id="lw-signer" className="input" value={f.signerName} onChange={(e) => set('signerName', e.target.value)} /></Field>
                            <Field label="Title" htmlFor="lw-title"><input id="lw-title" className="input" value={f.signerTitle} onChange={(e) => set('signerTitle', e.target.value)} /></Field>
                        </div>
                        {f.signatureDataUrl ? (
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={useSignature} onChange={(e) => setUseSignature(e.target.checked)} className="h-4 w-4" />
                                Sign with my saved signature
                            </label>
                        ) : (
                            <p className="text-xs text-muted-foreground">No saved signature: the waiver gets a signature line (add one in Settings › Signature to sign it here).</p>
                        )}
                    </>
                )}

                {check.warnings.map(w => <p key={w} className="rounded-xl bg-warning/10 px-3 py-2 text-sm text-foreground">{w}</p>)}
                <p className="text-xs text-muted-foreground">General form. Some states (for example California, Texas, Florida and Georgia) require their own statutory wording; where they do, use that form.</p>
                {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
            </div>
        </Modal>
    );
};

export default LienWaiverModal;
