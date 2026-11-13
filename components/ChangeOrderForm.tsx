import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FormType, type ChangeOrderData, type UserProfile, type Job, type Client, type SavedItem, type InventoryItem } from '../types.ts';
import { generateChangeOrderPDF } from '../services/pdfGenerator.ts';
import { computeDocumentTotals, formatMoney, roundMoney, toNumber } from '../utils/money.ts';
import { ChangeOrderIcon, FileTextIcon, DollarIcon } from './Icons.tsx';
import ShareModal from './ShareModal.tsx';
import ShareButton from './forms/ShareButton.tsx';
import { FormShell } from './forms/FormShell.tsx';
import { DateField, FieldGrid, FormSection, MoneyField, SelectField, TextAreaField, TextField } from './forms/Fields.tsx';
import { AIInsightsSection, ApprovalSection, ClientSection, CompanySection, SignatureSection, SummaryRow, TemplateSection } from './forms/Sections.tsx';
import LineItemsEditor from './forms/LineItemsEditor.tsx';
import AIFillButton from './forms/AIFillButton.tsx';
import { backfillCompany, DEFAULT_TEMPLATE_ID, DEFAULT_THEME, useDocumentForm, type SaveHandler } from './forms/useDocumentForm.ts';
import { blankLineItem, isISODate, normalizeLineItems, todayISO } from './forms/formUtils.ts';
import { STATUS_OPTIONS } from './forms/documentFields.ts';
import { makeStockLookup } from './forms/inventory.ts';
import { isClientSigned, signedChangeProblem } from './forms/signedLock.ts';
import { LockedFieldset, SignedLockBanner, makeSignatureCheck, useSignedLock } from './forms/SignedLock.tsx';
import { changeOrderStatus, computeContractValue, type ContractValue } from './forms/contractValue.ts';
import { fetchJobContractRows } from './forms/jobDocuments.ts';

interface Props {
    job: Job;
    profile: UserProfile;
    data?: ChangeOrderData | null;
    clients?: Client[];
    savedItems?: SavedItem[];
    inventoryItems?: InventoryItem[];
    onSave: SaveHandler<ChangeOrderData>;
    onBack: () => void;
    onUploadImage?: (file: File) => Promise<string>;
    publicToken?: string | null;
    prefillData?: unknown;
    documentId?: string;
    existingNumbers?: string[];
}

const REASONS = ['Client request', 'Unforeseen site condition', 'Design change', 'Code / inspection requirement', 'Material substitution', 'Schedule change'];

/** "EST-001 ($12,000.00) + 2 approved change orders (+$1,500.00)" */
const describeContractValue = (cv: ContractValue): string => {
    const parts: string[] = [];
    if (cv.estimates.length === 1) parts.push(`accepted estimate ${cv.estimates[0].number || ''} (${formatMoney(cv.estimateTotal)})`.replace(/\s+\(/, ' ('));
    else if (cv.estimates.length > 1) parts.push(`${cv.estimates.length} accepted estimates (${formatMoney(cv.estimateTotal)})`);
    if (cv.changeOrders.length) {
        const sign = cv.changeOrdersTotal < 0 ? '−' : '+';
        parts.push(`${cv.changeOrders.length} approved change order${cv.changeOrders.length === 1 ? '' : 's'} (${sign}${formatMoney(Math.abs(cv.changeOrdersTotal))})`);
    }
    return parts.join(' + ');
};

const ChangeOrderForm: React.FC<Props> = ({
    job, profile, data, clients = [], savedItems = [], inventoryItems = [], onSave, onBack, onUploadImage, publicToken, prefillData, documentId, existingNumbers,
}) => {
    const [shareOpen, setShareOpen] = useState(false);
    const [jobValue, setJobValue] = useState<ContractValue | null>(null);
    const stockLookup = useMemo(() => makeStockLookup(inventoryItems, data ?? null), [inventoryItems, data]);
    const idRef = useRef<string | undefined>(documentId);

    const form = useDocumentForm<ChangeOrderData>({
        formType: FormType.ChangeOrder,
        initial: data ?? null,
        prefillData,
        onSave,
        existingNumbers,
        download: d => generateChangeOrderPDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID),
        makeDefaults: () => ({
            title: '',
            changeOrderNumber: '',
            date: todayISO(),
            status: 'Draft',
            reason: '',
            description: '',
            currentContractSum: 0,
            lineItems: [blankLineItem()],
            terms: 'The Contract Time will be increased by 0 days. All other terms and conditions of the original contract remain in full force and effect.',
            companyName: profile.companyName || '',
            companyAddress: profile.address || '',
            companyPhone: profile.phone || '',
            companyWebsite: profile.website || '',
            clientName: job.clientName || '',
            clientAddress: job.clientAddress || '',
            logoUrl: profile.logoUrl || '',
            signatureUrl: '',
            templateId: DEFAULT_TEMPLATE_ID,
            themeColors: { ...DEFAULT_THEME },
        }),
        hydrate: d => backfillCompany({
            ...d,
            lineItems: normalizeLineItems(d.lineItems, false),
            currentContractSum: toNumber(d.currentContractSum),
            description: d.description ?? '',
            reason: d.reason ?? '',
            terms: d.terms ?? '',
            // The approval link stores "Accepted" (shown as Approved). Change orders saved before the status field
            // existed were already issued (the client portal lists them), so they open as Sent, not Draft.
            status: (String(d.status || '').trim() || isClientSigned(d) ? changeOrderStatus(d) : 'Sent') as ChangeOrderData['status'],
        }, profile),
        validate: d => {
            if (!String(d.changeOrderNumber || '').trim()) return 'Add a change order number.';
            if (!isISODate(d.date)) return 'Add a valid date.';
            // Short stock never blocks saving (a payment/approval must always be recordable): the database lets stock
            // go negative and flags it in the inventory history; line rows already show stock warnings.
            return null;
        },
        guard: (next, lastSaved) => signedChangeProblem(lastSaved, next, 'changeOrder'),
        beforeSave: makeSignatureCheck('changeOrder', () => idRef.current),
    });
    const { data: d, update } = form;
    idRef.current = documentId ?? form.lastSaveResult?.id;
    const lock = useSignedLock({ form, kind: 'changeOrder', formType: FormType.ChangeOrder, job, documentId: idRef.current, numberKey: 'changeOrderNumber' });
    const locked = lock.locked;
    // Net change is the sum of the lines (credits allowed); no tax/discount on change orders.
    const netChange = computeDocumentTotals({ lineItems: d.lineItems }).subtotal;
    const newTotal = roundMoney(toNumber(d.currentContractSum) + netChange);
    const token = lock.newToken ?? publicToken ?? form.lastSaveResult?.public_token ?? null;

    // "Current contract value" = the job's accepted estimate + EARLIER approved change orders (QA 0b.12).
    // A new change order is pre-filled (unless a value was already given); an existing one only gets a suggestion.
    const prefilledRef = useRef(false);
    useEffect(() => {
        if (locked) return;
        let active = true;
        void fetchJobContractRows(job.id).then(rows => {
            if (!active) return;
            const self = documentId ? rows.find(r => r.id === documentId) : undefined;
            const cv = computeContractValue(rows, { excludeId: documentId, createdBefore: self?.created_at || undefined });
            if (!cv.estimates.length && !cv.changeOrders.length) return;
            setJobValue(cv);
            if (form.isNew && !prefilledRef.current) {
                prefilledRef.current = true;
                form.replaceSilently(prev => (toNumber(prev.currentContractSum) ? prev : { ...prev, currentContractSum: cv.total }));
            }
        });
        return () => { active = false; };
    }, [job.id, documentId]); // eslint-disable-line react-hooks/exhaustive-deps

    const contractHint = jobValue
        ? roundMoney(toNumber(d.currentContractSum)) === jobValue.total
            ? `From ${describeContractValue(jobValue)}.`
            : (
                <>
                    Job contract value: {formatMoney(jobValue.total)} ({describeContractValue(jobValue)}).{' '}
                    {!locked && <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => update({ currentContractSum: jobValue.total })}>Use it</button>}
                </>
            )
        : 'The contract total before this change.';

    return (
        <FormShell
            title="Change order"
            subtitle={[d.changeOrderNumber, d.clientName].filter(Boolean).join(' · ') || 'New change order'}
            icon={ChangeOrderIcon}
            status={d.status}
            aiGenerated={Boolean((d as any).isAiGenerated)}
            isDirty={form.isDirty}
            saving={form.saving}
            downloading={form.downloading}
            justSaved={form.justSaved}
            feedback={form.feedback}
            onDismissFeedback={() => form.setFeedback(null)}
            onBack={onBack}
            onSave={form.save}
            onDownload={form.download}
            onSaveAndDownload={form.saveAndDownload}
            preview={{ formType: FormType.ChangeOrder, data: d, profile, job }}
            actions={(
                <>
                    {!locked && <AIFillButton jobId={job.id} formType={FormType.ChangeOrder} onApply={form.applyDraft} compact />}
                    <ShareButton ensureSaved={form.ensureSaved} onOpen={() => setShareOpen(true)} />
                </>
            )}
        >
            {locked && <SignedLockBanner data={d} kind="changeOrder" onRevise={lock.openRevise} />}

            <LockedFieldset locked={locked} className="space-y-6">
                <FormSection title="Change details" icon={FileTextIcon}>
                    <FieldGrid>
                        <TextField label="Change order #" value={d.changeOrderNumber} onChange={v => update({ changeOrderNumber: v })} />
                        <SelectField
                            label="Status"
                            value={d.status}
                            options={STATUS_OPTIONS.changeOrder}
                            onChange={v => update({ status: v as ChangeOrderData['status'] })}
                            hint={!locked ? 'Changes to Approved by itself when the client signs the approval link.' : undefined}
                        />
                        <DateField label="Date" value={d.date} onChange={v => update({ date: v })} />
                        <TextField label="Reason" value={d.reason} onChange={v => update({ reason: v })} list="co-reasons" placeholder="e.g. Client request" />
                        <TextField label="Title (optional)" value={d.title} onChange={v => update({ title: v })} placeholder="e.g. Add bathroom outlet" fieldClassName="sm:col-span-2" />
                        <TextAreaField label="Description of change" value={d.description} onChange={v => update({ description: v })} rows={4} fieldClassName="sm:col-span-2" />
                    </FieldGrid>
                    <datalist id="co-reasons">{REASONS.map(r => <option key={r} value={r} />)}</datalist>
                </FormSection>

                <ClientSection
                    clients={clients}
                    job={job}
                    clientId={(d as any).clientId}
                    clientName={d.clientName}
                    address={d.clientAddress}
                    onChange={patch => update(patch as Partial<ChangeOrderData>)}
                />

                <CompanySection data={d} onChange={patch => update(patch)} onUploadImage={onUploadImage} />
            </LockedFieldset>

            <FormSection title="Cost of the change" description="Add lines for added work. Use a negative price for credits." icon={DollarIcon}>
                <MoneyField
                    label="Current contract value"
                    value={d.currentContractSum}
                    onValueChange={v => update({ currentContractSum: v })}
                    hint={contractHint}
                    fieldClassName="sm:max-w-md"
                    disabled={locked}
                />
                <LockedFieldset locked={locked} className="space-y-5">
                    <LineItemsEditor
                        items={d.lineItems}
                        onChange={items => update({ lineItems: items })}
                        savedItems={savedItems}
                        inventoryItems={inventoryItems}
                        availableStock={stockLookup}
                    />
                </LockedFieldset>
                <div className="ml-auto w-full space-y-2 rounded-xl border border-border bg-muted/40 p-4 sm:max-w-sm">
                    <SummaryRow label="Current contract" value={formatMoney(d.currentContractSum)} />
                    <SummaryRow label="This change" value={<span className={netChange < 0 ? 'text-destructive' : 'text-primary'}>{netChange >= 0 ? '+' : '−'}{formatMoney(Math.abs(netChange))}</span>} />
                    <SummaryRow label="New contract total" value={formatMoney(newTotal)} strong className="border-t border-border pt-3" />
                </div>
            </FormSection>

            <LockedFieldset locked={locked} className="space-y-6">
                <FormSection title="Terms" description="Printed on the change order.">
                    <TextAreaField label="Terms & conditions" value={d.terms} onChange={v => update({ terms: v })} rows={3} />
                </FormSection>
            </LockedFieldset>

            <ApprovalSection
                key={lock.newToken || 'approval'}
                documentId={idRef.current}
                docLabel="Change order"
                publicToken={token}
                clientSignatureUrl={d.clientSignatureUrl}
                clientSignedAt={d.clientSignedAt}
                clientSignedBy={d.clientSignedBy}
                clientName={d.clientName}
            />

            <LockedFieldset locked={locked} className="space-y-6">
                <AIInsightsSection data={d.ai_visual_data} onRemove={() => update({ ai_visual_data: undefined })} />

                <SignatureSection value={d.signatureUrl} onChange={url => update({ signatureUrl: url })} profile={profile} description="Your signature authorizes this change." />
            </LockedFieldset>

            <TemplateSection templateId={d.templateId} themeColors={d.themeColors} onChange={patch => update(patch)} />

            {lock.dialogs}

            <ShareModal
                isOpen={shareOpen}
                onClose={() => setShareOpen(false)}
                data={d}
                docType={FormType.ChangeOrder}
                profile={profile}
                documentId={idRef.current}
                publicToken={token}
                clients={clients}
                job={job}
                hasUnsavedChanges={form.isDirty}
                onDownload={form.download}
                getPdfDataUri={async () => String(await generateChangeOrderPDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID, true) || '')}
            />
        </FormShell>
    );
};

export default ChangeOrderForm;
