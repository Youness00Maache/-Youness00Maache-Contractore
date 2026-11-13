import React, { useState } from 'react';
import { FormType, type ReceiptData, type UserProfile, type Job, type Client } from '../types.ts';
import { generateReceiptPDF } from '../services/pdfGenerator.ts';
import { toNumber } from '../utils/money.ts';
import { ReceiptIcon, DollarIcon, ShareIcon } from './Icons.tsx';
import ShareModal from './ShareModal.tsx';
import { FormShell } from './forms/FormShell.tsx';
import { DateField, FieldGrid, FormSection, MoneyField, SelectField, TextAreaField, TextField } from './forms/Fields.tsx';
import { ClientSection, CompanySection, SignatureSection, TemplateSection } from './forms/Sections.tsx';
import { backfillCompany, DEFAULT_TEMPLATE_ID, DEFAULT_THEME, useDocumentForm, type SaveHandler } from './forms/useDocumentForm.ts';
import { isISODate, todayISO } from './forms/formUtils.ts';
import { PAYMENT_METHODS } from './forms/documentFields.ts';

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
            description: 'Payment for services rendered',
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
            actions={(
                <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={() => setShareOpen(true)}>
                    <ShareIcon className="h-4 w-4" /> Share
                </button>
            )}
        >
            <FormSection title="Payment received" icon={DollarIcon}>
                <FieldGrid>
                    <TextField label="Receipt #" value={d.receiptNumber} onChange={v => update({ receiptNumber: v })} />
                    <DateField label="Date received" value={d.date} onChange={v => update({ date: v })} />
                    <MoneyField label="Amount received" value={d.amount} onValueChange={v => update({ amount: v })} />
                    <SelectField label="Payment method" value={d.paymentMethod} options={PAYMENT_METHODS} onChange={v => update({ paymentMethod: v })} />
                    <TextAreaField label="For" value={d.description} onChange={v => update({ description: v })} rows={3} fieldClassName="sm:col-span-2" placeholder="e.g. Deposit for kitchen remodel (invoice INV-2026-11-004)" />
                    <TextField label="Title (optional)" value={d.title} onChange={v => update({ title: v })} fieldClassName="sm:col-span-2" />
                </FieldGrid>
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
                publicToken={publicToken ?? null}
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
