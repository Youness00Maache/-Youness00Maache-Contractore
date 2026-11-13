import React, { useMemo, useState } from 'react';
import { FormType, type InvoiceData, type Job, type UserProfile, type SavedItem, type InventoryItem, type Client } from '../types.ts';
import { generateInvoicePDF } from '../services/pdfGenerator.ts';
import { computeDocumentTotals, toNumber } from '../utils/money.ts';
import { InvoiceIcon, ClockIcon, CreditCardIcon, FileTextIcon, PercentIcon } from './Icons.tsx';
import ShareModal from './ShareModal.tsx';
import ShareButton from './forms/ShareButton.tsx';
import { FormShell } from './forms/FormShell.tsx';
import { DateField, FieldGrid, FormSection, SelectField, Segmented, TextAreaField, TextField, Toggle } from './forms/Fields.tsx';
import { AIInsightsSection, ClientSection, CompanySection, SignatureSection, TemplateSection } from './forms/Sections.tsx';
import LineItemsEditor from './forms/LineItemsEditor.tsx';
import TotalsPanel from './forms/TotalsPanel.tsx';
import AIFillButton from './forms/AIFillButton.tsx';
import { backfillCompany, DEFAULT_TEMPLATE_ID, DEFAULT_THEME, useDocumentForm, type SaveHandler } from './forms/useDocumentForm.ts';
import { addDaysISO, addMonthsISO, blankLineItem, formatDisplayDate, isISODate, normalizeLineItems, normalizeLinkUrl, todayISO } from './forms/formUtils.ts';
import { RECURRENCE_FREQUENCIES, STATUS_OPTIONS } from './forms/documentFields.ts';
import { makeStockLookup } from './forms/inventory.ts';

interface InvoiceFormProps {
    job: Job;
    /** current parent prop names */
    userProfile?: UserProfile;
    invoice?: InvoiceData | null;
    onClose?: () => void;
    /** shared form prop names (aliases) */
    profile?: UserProfile;
    data?: InvoiceData | null;
    onBack?: () => void;
    clients?: Client[];
    onSave: SaveHandler<InvoiceData>;
    onUploadImage?: (file: File) => Promise<string>;
    savedItems?: SavedItem[];
    inventoryItems?: InventoryItem[];
    prefillData?: unknown;
    documentId?: string;
    publicToken?: string | null;
    existingNumbers?: string[];
}

const RECURRENCE_MONTHS: Record<string, number> = { Monthly: 1, Quarterly: 3, 'Bi-Annually': 6, Annually: 12 };
const DUE_TERMS = [
    { label: 'On receipt', days: 0 },
    { label: 'Net 15', days: 15 },
    { label: 'Net 30', days: 30 },
    { label: 'Net 60', days: 60 },
];

const InvoiceForm: React.FC<InvoiceFormProps> = props => {
    const { job, clients = [], onSave, onUploadImage, savedItems = [], inventoryItems = [], prefillData, documentId, publicToken, existingNumbers } = props;
    const profile = (props.userProfile || props.profile) as UserProfile;
    const saved = props.invoice ?? props.data ?? null;
    const goBack = props.onClose || props.onBack || (() => undefined);
    const [shareOpen, setShareOpen] = useState(false);
    const [payLinkOpen, setPayLinkOpen] = useState(Boolean(saved?.paypalLink));

    const download = (d: InvoiceData) => generateInvoicePDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID);
    const stockLookup = useMemo(() => makeStockLookup(inventoryItems, saved), [inventoryItems, saved]);

    const form = useDocumentForm<InvoiceData>({
        formType: FormType.Invoice,
        initial: saved,
        prefillData,
        onSave,
        download,
        existingNumbers,
        makeDefaults: () => {
            const issueDate = todayISO();
            return {
                title: '',
                invoiceNumber: '',
                issueDate,
                dueDate: addDaysISO(30, issueDate),
                status: 'Draft',
                lineItems: [blankLineItem()],
                isProgressBilling: false,
                discount: 0,
                taxRate: 0,
                shipping: 0,
                notes: 'Thank you for your business.',
                paypalLink: '',
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
                recurrence: { enabled: false, frequency: 'Monthly' },
            };
        },
        hydrate: d => backfillCompany({
            ...d,
            lineItems: normalizeLineItems(d.lineItems, false),
            discount: toNumber(d.discount),
            taxRate: toNumber(d.taxRate),
            shipping: toNumber(d.shipping),
            // deposits / payments already received: absent stays absent (a Paid invoice then counts as paid in full)
            ...(d.amountPaid !== undefined && d.amountPaid !== null ? { amountPaid: toNumber(d.amountPaid) } : {}),
            notes: d.notes ?? '',
            status: d.status || 'Draft',
        }, profile),
        validate: d => {
            if (!String(d.invoiceNumber || '').trim()) return 'Add an invoice number.';
            if (!isISODate(d.issueDate)) return 'Add a valid issue date.';
            if (d.dueDate && isISODate(d.dueDate) && d.dueDate < d.issueDate) return 'The due date is before the issue date.';
            if (d.paypalLink && !normalizeLinkUrl(d.paypalLink)) return 'The payment link must be a web address (https://…).';
            if (d.recurrence?.enabled && !isISODate(d.recurrence.nextRunDate)) return 'Choose the date of the next recurring invoice.';
            // Short stock never blocks saving (a payment/approval must always be recordable): the database lets stock
            // go negative and flags it in the inventory history; line rows already show stock warnings.
            return null;
        },
        prepare: d => ({ ...d, paypalLink: d.paypalLink ? normalizeLinkUrl(d.paypalLink) || d.paypalLink : '' }),
    });
    const { data: d, update } = form;
    const totals = computeDocumentTotals(d);
    const progress = Boolean(d.isProgressBilling);
    const showPayLink = payLinkOpen || Boolean(d.paypalLink);
    const recurrence = d.recurrence || { enabled: false, frequency: 'Monthly' as const };

    const setRecurrence = (patch: Partial<NonNullable<InvoiceData['recurrence']>>) =>
        update(prev => ({ ...prev, recurrence: { enabled: false, frequency: 'Monthly', ...prev.recurrence, ...patch } }));

    const toggleRecurrence = (enabled: boolean) => {
        const months = RECURRENCE_MONTHS[recurrence.frequency || 'Monthly'] || 1;
        setRecurrence({ enabled, ...(enabled && !recurrence.nextRunDate ? { nextRunDate: addMonthsISO(months, d.issueDate || todayISO()) } : {}) });
    };

    return (
        <FormShell
            title="Invoice"
            subtitle={[d.invoiceNumber, d.clientName].filter(Boolean).join(' · ') || 'New invoice'}
            icon={InvoiceIcon}
            status={d.status}
            aiGenerated={Boolean((d as any).isAiGenerated)}
            isDirty={form.isDirty}
            saving={form.saving}
            downloading={form.downloading}
            justSaved={form.justSaved}
            feedback={form.feedback}
            onDismissFeedback={() => form.setFeedback(null)}
            onBack={goBack}
            onSave={form.save}
            onDownload={form.download}
            onSaveAndDownload={form.saveAndDownload}
            preview={{ formType: FormType.Invoice, data: d, profile, job }}
            actions={(
                <>
                    <AIFillButton jobId={job.id} formType={FormType.Invoice} onApply={form.applyDraft} compact />
                    <ShareButton ensureSaved={form.ensureSaved} onOpen={() => setShareOpen(true)} />
                </>
            )}
        >
            <FormSection title="Invoice details" icon={FileTextIcon} description={d.sourceEstimateNumber ? `Created from estimate ${d.sourceEstimateNumber}.` : undefined}>
                <FieldGrid>
                    <TextField label="Invoice #" value={d.invoiceNumber} onChange={v => update({ invoiceNumber: v })} />
                    <SelectField label="Status" value={d.status} options={STATUS_OPTIONS.invoice} onChange={v => update({ status: v as InvoiceData['status'] })} />
                    <DateField label="Issue date" value={d.issueDate} onChange={v => update({ issueDate: v })} />
                    <DateField
                        label="Due date"
                        value={d.dueDate}
                        onChange={v => update({ dueDate: v })}
                        error={d.dueDate && d.issueDate && d.dueDate < d.issueDate ? 'Due date is before the issue date.' : undefined}
                    />
                    <div className="sm:col-span-2 -mt-2 flex flex-wrap gap-2">
                        {DUE_TERMS.map(t => (
                            <button key={t.label} type="button" className="btn btn-ghost btn-sm min-h-[36px] border border-border" onClick={() => update({ dueDate: addDaysISO(t.days, d.issueDate || todayISO()) })}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                    <TextField label="Title (optional)" value={d.title} onChange={v => update({ title: v })} placeholder="e.g. Kitchen remodel – final" fieldClassName="sm:col-span-2" hint="Shown in your document list. Leave empty to use the invoice number." />
                </FieldGrid>
            </FormSection>

            <ClientSection
                clients={clients}
                job={job}
                clientId={(d as any).clientId}
                clientName={d.clientName}
                address={d.clientAddress}
                onChange={patch => update(patch as Partial<InvoiceData>)}
                description="Who you are billing."
            />

            <CompanySection data={d} onChange={patch => update(patch)} onUploadImage={onUploadImage} />

            <FormSection
                title="Items"
                description={progress ? 'Progress billing: bill the % completed on each line, minus what was billed before.' : 'Products, materials and labor on this invoice.'}
                icon={PercentIcon}
                actions={(
                    <Segmented
                        ariaLabel="Billing mode"
                        value={progress ? 'progress' : 'standard'}
                        onChange={v => update({ isProgressBilling: v === 'progress' })}
                        options={[{ value: 'standard', label: 'Standard' }, { value: 'progress', label: 'Progress billing' }]}
                    />
                )}
            >
                <LineItemsEditor
                    items={d.lineItems}
                    onChange={items => update({ lineItems: items })}
                    mode={progress ? 'progress' : 'standard'}
                    savedItems={savedItems}
                    inventoryItems={inventoryItems}
                    availableStock={stockLookup}
                />
                <TotalsPanel
                    totals={totals}
                    totalLabel="Total due"
                    adjustments={{
                        discount: d.discount, taxRate: d.taxRate, shipping: d.shipping, amountPaid: d.amountPaid,
                        fields: ['discount', 'taxRate', 'shipping', 'amountPaid'],
                        onChange: patch => update(patch),
                    }}
                />
            </FormSection>

            <FormSection title="Payment" description="Let the client pay online from the PDF." icon={CreditCardIcon}>
                <Toggle
                    checked={showPayLink}
                    onChange={on => { setPayLinkOpen(on); if (!on) update({ paypalLink: '' }); }}
                    label="Add a “Pay now” link"
                    description="Paste your PayPal.me, Stripe or Square payment link."
                />
                {showPayLink && (
                    <TextField
                        label="Payment link"
                        type="url"
                        inputMode="url"
                        value={d.paypalLink}
                        onChange={v => update({ paypalLink: v })}
                        onBlur={() => { const n = normalizeLinkUrl(d.paypalLink); if (n && n !== d.paypalLink) update({ paypalLink: n }); }}
                        placeholder="https://paypal.me/yourcompany"
                        error={d.paypalLink && !normalizeLinkUrl(d.paypalLink) ? 'Enter a web address starting with https://' : undefined}
                    />
                )}
            </FormSection>

            <FormSection title="Repeat this invoice" description="Bill the same items on a schedule." icon={ClockIcon}>
                <Toggle
                    checked={Boolean(recurrence.enabled)}
                    onChange={toggleRecurrence}
                    label="Create this invoice automatically"
                    description="On each date, a new draft copy (new number and dates) is added to this job for you to review and send."
                />
                {recurrence.enabled && (
                    <FieldGrid>
                        <SelectField
                            label="Frequency"
                            value={recurrence.frequency || 'Monthly'}
                            options={RECURRENCE_FREQUENCIES}
                            onChange={v => setRecurrence({ frequency: v as NonNullable<InvoiceData['recurrence']>['frequency'] })}
                        />
                        <DateField
                            label="Next invoice on"
                            value={recurrence.nextRunDate}
                            min={todayISO()}
                            onChange={v => setRecurrence({ nextRunDate: v })}
                            hint={recurrence.lastRunDate ? `Last created ${formatDisplayDate(recurrence.lastRunDate)}.` : undefined}
                        />
                    </FieldGrid>
                )}
            </FormSection>

            <FormSection title="Notes" description="Printed at the bottom of the invoice.">
                <TextAreaField label="Notes for the client" value={d.notes} onChange={v => update({ notes: v })} rows={3} placeholder="Payment instructions, thank-you note…" />
            </FormSection>

            <AIInsightsSection data={d.ai_visual_data} onRemove={() => update({ ai_visual_data: undefined })} />

            <SignatureSection value={d.signatureUrl} onChange={url => update({ signatureUrl: url })} profile={profile} />

            <TemplateSection templateId={d.templateId} themeColors={d.themeColors} onChange={patch => update(patch)} />

            <ShareModal
                isOpen={shareOpen}
                onClose={() => setShareOpen(false)}
                data={d}
                docType={FormType.Invoice}
                profile={profile}
                documentId={documentId ?? form.lastSaveResult?.id}
                publicToken={publicToken ?? form.lastSaveResult?.public_token ?? null}
                clients={clients}
                job={job}
                hasUnsavedChanges={form.isDirty}
                onDownload={form.download}
                getPdfDataUri={async () => String(await generateInvoicePDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID, true) || '')}
            />
        </FormShell>
    );
};

export default InvoiceForm;
