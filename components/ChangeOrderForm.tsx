import React, { useMemo, useState } from 'react';
import { FormType, type ChangeOrderData, type UserProfile, type Job, type Client, type SavedItem, type InventoryItem } from '../types.ts';
import { generateChangeOrderPDF } from '../services/pdfGenerator.ts';
import { computeDocumentTotals, formatMoney, roundMoney, toNumber } from '../utils/money.ts';
import { ChangeOrderIcon, ShareIcon, FileTextIcon, DollarIcon } from './Icons.tsx';
import ShareModal from './ShareModal.tsx';
import { FormShell } from './forms/FormShell.tsx';
import { DateField, FieldGrid, FormSection, MoneyField, TextAreaField, TextField } from './forms/Fields.tsx';
import { AIInsightsSection, ApprovalSection, ClientSection, CompanySection, SignatureSection, SummaryRow, TemplateSection } from './forms/Sections.tsx';
import LineItemsEditor from './forms/LineItemsEditor.tsx';
import AIFillButton from './forms/AIFillButton.tsx';
import { backfillCompany, DEFAULT_TEMPLATE_ID, DEFAULT_THEME, useDocumentForm, type SaveHandler } from './forms/useDocumentForm.ts';
import { blankLineItem, isISODate, normalizeLineItems, todayISO } from './forms/formUtils.ts';
import { makeStockLookup } from './forms/inventory.ts';

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

const ChangeOrderForm: React.FC<Props> = ({
    job, profile, data, clients = [], savedItems = [], inventoryItems = [], onSave, onBack, onUploadImage, publicToken, prefillData, documentId, existingNumbers,
}) => {
    const [shareOpen, setShareOpen] = useState(false);
    const stockLookup = useMemo(() => makeStockLookup(inventoryItems, data ?? null), [inventoryItems, data]);

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
        }, profile),
        validate: d => {
            if (!String(d.changeOrderNumber || '').trim()) return 'Add a change order number.';
            if (!isISODate(d.date)) return 'Add a valid date.';
            // Short stock never blocks saving (a payment/approval must always be recordable): the database lets stock
            // go negative and flags it in the inventory history; line rows already show stock warnings.
            return null;
        },
    });
    const { data: d, update } = form;
    // Net change is the sum of the lines (credits allowed); no tax/discount on change orders.
    const netChange = computeDocumentTotals({ lineItems: d.lineItems }).subtotal;
    const newTotal = roundMoney(toNumber(d.currentContractSum) + netChange);
    const token = publicToken ?? form.lastSaveResult?.public_token ?? null;

    return (
        <FormShell
            title="Change order"
            subtitle={[d.changeOrderNumber, d.clientName].filter(Boolean).join(' · ') || 'New change order'}
            icon={ChangeOrderIcon}
            status={d.clientSignatureUrl ? 'Approved' : (d as any).status}
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
                    <AIFillButton jobId={job.id} formType={FormType.ChangeOrder} onApply={form.applyDraft} compact />
                    <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={() => setShareOpen(true)}>
                        <ShareIcon className="h-4 w-4" /> Share
                    </button>
                </>
            )}
        >
            <FormSection title="Change details" icon={FileTextIcon}>
                <FieldGrid>
                    <TextField label="Change order #" value={d.changeOrderNumber} onChange={v => update({ changeOrderNumber: v })} />
                    <DateField label="Date" value={d.date} onChange={v => update({ date: v })} />
                    <TextField label="Reason" value={d.reason} onChange={v => update({ reason: v })} list="co-reasons" placeholder="e.g. Client request" />
                    <TextField label="Title (optional)" value={d.title} onChange={v => update({ title: v })} placeholder="e.g. Add bathroom outlet" />
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

            <FormSection title="Cost of the change" description="Add lines for added work. Use a negative price for credits." icon={DollarIcon}>
                <MoneyField label="Current contract value" value={d.currentContractSum} onValueChange={v => update({ currentContractSum: v })} hint="The contract total before this change." fieldClassName="sm:max-w-xs" />
                <LineItemsEditor
                    items={d.lineItems}
                    onChange={items => update({ lineItems: items })}
                    savedItems={savedItems}
                    inventoryItems={inventoryItems}
                    availableStock={stockLookup}
                />
                <div className="ml-auto w-full space-y-2 rounded-xl border border-border bg-muted/40 p-4 sm:max-w-sm">
                    <SummaryRow label="Current contract" value={formatMoney(d.currentContractSum)} />
                    <SummaryRow label="This change" value={<span className={netChange < 0 ? 'text-destructive' : 'text-primary'}>{netChange >= 0 ? '+' : '−'}{formatMoney(Math.abs(netChange))}</span>} />
                    <SummaryRow label="New contract total" value={formatMoney(newTotal)} strong className="border-t border-border pt-3" />
                </div>
            </FormSection>

            <FormSection title="Terms" description="Printed on the change order.">
                <TextAreaField label="Terms & conditions" value={d.terms} onChange={v => update({ terms: v })} rows={3} />
            </FormSection>

            <ApprovalSection
                documentId={documentId ?? form.lastSaveResult?.id}
                docLabel="Change order"
                publicToken={token}
                clientSignatureUrl={d.clientSignatureUrl}
                clientSignedAt={d.clientSignedAt}
                clientSignedBy={d.clientSignedBy}
                clientName={d.clientName}
            />

            <AIInsightsSection data={d.ai_visual_data} onRemove={() => update({ ai_visual_data: undefined })} />

            <SignatureSection value={d.signatureUrl} onChange={url => update({ signatureUrl: url })} profile={profile} description="Your signature authorizes this change." />

            <TemplateSection templateId={d.templateId} themeColors={d.themeColors} onChange={patch => update(patch)} />

            <ShareModal
                isOpen={shareOpen}
                onClose={() => setShareOpen(false)}
                data={d}
                docType={FormType.ChangeOrder}
                profile={profile}
                documentId={documentId ?? form.lastSaveResult?.id}
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
