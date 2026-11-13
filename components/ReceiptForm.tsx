import React, { useEffect, useState } from 'react';
import { FormType, type ReceiptData, type UserProfile, type Job, type Client } from '../types.ts';
import { generateReceiptPDF } from '../services/pdfGenerator.ts';
import { formatMoney, toNumber } from '../utils/money.ts';
import { ReceiptIcon, DollarIcon } from './Icons.tsx';
import ShareModal from './ShareModal.tsx';
import ShareButton from './forms/ShareButton.tsx';
import { FormShell } from './forms/FormShell.tsx';
import { DateField, FieldGrid, FormSection, MoneyField, SelectField, TextAreaField, TextField } from './forms/Fields.tsx';
import { ClientSection, CompanySection, SignatureSection, TemplateSection } from './forms/Sections.tsx';
import { backfillCompany, DEFAULT_TEMPLATE_ID, DEFAULT_THEME, useDocumentForm, type SaveHandler } from './forms/useDocumentForm.ts';
import { isISODate, todayISO } from './forms/formUtils.ts';
import { PAYMENT_METHODS } from './forms/documentFields.ts';
import { fetchJobInvoices, type JobInvoiceOption } from './forms/jobDocuments.ts';

const DEFAULT_DESCRIPTION = 'Payment for services rendered';

interface Props {
    job: Job;
    profile: UserProfile;
    data: ReceiptData | null;
    clients?: Client[];
    onSave: SaveHandler<ReceiptData>;
    onBack: () => void;
    onUploadImage?: (file: File) => Promise<string>;
    prefillData?: unknown;
    documentId?: string;
    publicToken?: string | null;
    existingNumbers?: string[];
}

type ReceiptState = ReceiptData & { clientId?: string };

const ReceiptForm: React.FC<Props> = ({ job, profile, data, clients = [], onSave, onBack, onUploadImage, prefillData, documentId, publicToken, existingNumbers }) => {
    const [shareOpen, setShareOpen] = useState(false);
    const [invoices, setInvoices] = useState<JobInvoiceOption[]>([]);
    useEffect(() => {
        let active = true;
        void fetchJobInvoices(job.id).then(list => { if (active) setInvoices(list); });
        return () => { active = false; };
    }, [job.id]);
    const form = useDocumentForm<ReceiptState>({
        formType: FormType.Receipt,
        initial: data as ReceiptState | null,
        prefillData,
        onSave: onSave as SaveHandler<ReceiptState>,
        existingNumbers,
        download: d => generateReceiptPDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID),
        makeDefaults: () => ({
            title: '',
            receiptNumber: '',
            date: todayISO(),
            clientName: job.clientName || '',
            clientAddress: job.clientAddress || '',
            amount: 0,
            description: DEFAULT_DESCRIPTION,
            paymentMethod: 'Check',
            companyName: profile.companyName || '',
            companyAddress: profile.address || '',
            companyPhone: profile.phone || '',
            companyWebsite: profile.website || '',
            logoUrl: profile.logoUrl || '',
            signatureUrl: '',
            templateId: DEFAULT_TEMPLATE_ID,
            themeColors: { ...DEFAULT_THEME },
        }),
        // legacy receipts stored the payer as `from`
        hydrate: d => backfillCompany({ ...d, clientName: d.clientName || (d as any).from || '', amount: toNumber(d.amount), description: d.description ?? '' }, profile),
        validate: d => {
            if (!String(d.receiptNumber || '').trim()) return 'Add a receipt number.';
            if (!isISODate(d.date)) return 'Add a valid date.';
            if (!(toNumber(d.amount) > 0)) return 'Enter the amount received.';
            return null;
        },
    });
    const { data: d, update } = form;

    // "For invoice": stores the invoice's id AND number so job financials link the payment reliably
    const invoiceOptions = [
        ...invoices.map(i => ({ value: i.id, label: [i.number || 'Invoice', formatMoney(i.total), i.status].filter(Boolean).join(' · ') })),
        ...(d.invoiceId && !invoices.some(i => i.id === d.invoiceId) ? [{ value: d.invoiceId, label: d.invoiceNumber || 'Linked invoice' }] : []),
    ];
    const pickInvoice = (id: string) => {
        const inv = invoices.find(i => i.id === id);
        if (!id) { update({ invoiceId: undefined, invoiceNumber: undefined }); return; }
        update(prev => {
            const description = String(prev.description || '').trim();
            return {
                ...prev,
                invoiceId: id,
                invoiceNumber: inv?.number || prev.invoiceNumber,
                // an empty amount becomes what is still owed on that invoice
                ...(inv && !(toNumber(prev.amount) > 0) && inv.balanceDue > 0 ? { amount: inv.balanceDue } : {}),
                ...(inv?.number && (!description || description === DEFAULT_DESCRIPTION) ? { description: `Payment for invoice ${inv.number}` } : {}),
            };
        });
    };

    return (
        <FormShell
            title="Receipt"
            subtitle={[d.receiptNumber, d.clientName].filter(Boolean).join(' · ') || 'New receipt'}
            icon={ReceiptIcon}
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
            preview={{ formType: FormType.Receipt, data: d, profile, job }}
            actions={<ShareButton ensureSaved={form.ensureSaved} onOpen={() => setShareOpen(true)} />}
        >
            <FormSection title="Payment received" icon={DollarIcon}>
                <FieldGrid>
                    <TextField label="Receipt #" value={d.receiptNumber} onChange={v => update({ receiptNumber: v })} />
                    <DateField label="Date received" value={d.date} onChange={v => update({ date: v })} />
                    <MoneyField label="Amount received" value={d.amount} onValueChange={v => update({ amount: v })} />
                    {/* free text like the original app ("Check #1234", "Card ending 4242"); the list only suggests */}
                    <TextField label="Payment method" value={d.paymentMethod} onChange={v => update({ paymentMethod: v })} list="receipt-payment-methods" placeholder="e.g. Check #1234" autoComplete="off" />
                    {invoiceOptions.length > 0 ? (
                        <SelectField
                            label="For invoice (optional)"
                            value={d.invoiceId || ''}
                            placeholder="Not linked to an invoice"
                            options={invoiceOptions}
                            onChange={pickInvoice}
                            fieldClassName="sm:col-span-2"
                            hint="Links this payment to the invoice so the job shows it as collected."
                        />
                    ) : (
                        <TextField
                            label="For invoice # (optional)"
                            value={d.invoiceNumber}
                            onChange={v => update({ invoiceNumber: v, invoiceId: undefined })}
                            placeholder="e.g. INV-2026-11-004"
                            fieldClassName="sm:col-span-2"
                        />
                    )}
                    <TextAreaField label="For" value={d.description} onChange={v => update({ description: v })} rows={3} fieldClassName="sm:col-span-2" placeholder="e.g. Deposit for kitchen remodel (invoice INV-2026-11-004)" />
                    <TextField label="Title (optional)" value={d.title} onChange={v => update({ title: v })} fieldClassName="sm:col-span-2" />
                </FieldGrid>
                <datalist id="receipt-payment-methods">{PAYMENT_METHODS.map(m => <option key={m} value={m} />)}</datalist>
            </FormSection>

            <ClientSection
                clients={clients}
                job={job}
                clientId={d.clientId}
                clientName={d.clientName}
                address={d.clientAddress}
                nameLabel="Received from"
                title="Payer"
                description="Who paid you."
                onChange={patch => update(patch as Partial<ReceiptState>)}
            />

            <CompanySection data={d} onChange={patch => update(patch)} onUploadImage={onUploadImage} />

            <SignatureSection value={d.signatureUrl} onChange={url => update({ signatureUrl: url })} profile={profile} title="Received by" />

            <TemplateSection templateId={d.templateId} themeColors={d.themeColors} onChange={patch => update(patch)} />

            <ShareModal
                isOpen={shareOpen}
                onClose={() => setShareOpen(false)}
                data={d}
                docType={FormType.Receipt}
                profile={profile}
                documentId={documentId ?? form.lastSaveResult?.id}
                publicToken={publicToken ?? form.lastSaveResult?.public_token ?? null}
                clients={clients}
                job={job}
                hasUnsavedChanges={form.isDirty}
                onDownload={form.download}
                getPdfDataUri={async () => String(await generateReceiptPDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID, true) || '')}
            />
        </FormShell>
    );
};

export default ReceiptForm;
