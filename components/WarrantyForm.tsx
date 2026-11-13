import React, { useState } from 'react';
import { FormType, type WarrantyData, type UserProfile, type Job, type Client } from '../types.ts';
import { generateWarrantyPDF } from '../services/pdfGenerator.ts';
import { WarrantyIcon, ShieldCheckIcon, BriefcaseIcon } from './Icons.tsx';
import ShareModal from './ShareModal.tsx';
import ShareButton from './forms/ShareButton.tsx';
import AIFillButton from './forms/AIFillButton.tsx';
import { FormShell } from './forms/FormShell.tsx';
import { DateField, FieldGrid, FormSection, TextAreaField, TextField } from './forms/Fields.tsx';
import { AIInsightsSection, ClientSection, LogoField, SignatureSection, TemplateSection } from './forms/Sections.tsx';
import { DEFAULT_TEMPLATE_ID, DEFAULT_THEME, useDocumentForm, type SaveHandler } from './forms/useDocumentForm.ts';
import { isISODate, todayISO } from './forms/formUtils.ts';

interface Props {
    job: Job;
    profile: UserProfile;
    data: WarrantyData | null;
    clients?: Client[];
    onSave: SaveHandler<WarrantyData>;
    onBack: () => void;
    onUploadImage?: (file: File) => Promise<string>;
    prefillData?: unknown;
    documentId?: string;
    existingNumbers?: string[];
}

type WarrantyState = WarrantyData & { clientId?: string };

const DURATIONS = ['90 Days', '6 Months', '1 Year', '2 Years', '5 Years', '10 Years', 'Lifetime'];

const WarrantyForm: React.FC<Props> = ({ job, profile, data, clients = [], onSave, onBack, onUploadImage, prefillData, documentId, existingNumbers }) => {
    const [shareOpen, setShareOpen] = useState(false);
    const form = useDocumentForm<WarrantyState>({
        formType: FormType.Warranty,
        initial: data as WarrantyState | null,
        prefillData,
        onSave: onSave as SaveHandler<WarrantyState>,
        existingNumbers,
        download: d => generateWarrantyPDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID),
        makeDefaults: () => ({
            title: '',
            warrantyNumber: '',
            clientName: job.clientName || '',
            projectAddress: job.clientAddress || '',
            completedDate: todayISO(),
            duration: '1 Year',
            coverage: 'This warranty covers defects in workmanship and materials provided by the contractor for the duration specified above. We will repair or replace any defective work at no cost to the owner.',
            conditions: 'This warranty does not cover damage resulting from normal wear and tear, negligence, abuse, natural disasters, or modifications made by others. Notification of any defect must be made in writing within the warranty period.',
            signatureUrl: '',
            logoUrl: profile.logoUrl || '',
            templateId: DEFAULT_TEMPLATE_ID,
            themeColors: { ...DEFAULT_THEME },
        }),
        hydrate: d => ({ ...d, logoUrl: d.logoUrl || profile.logoUrl || '', coverage: d.coverage ?? '', conditions: d.conditions ?? '' }),
        validate: d => {
            if (!String(d.warrantyNumber || '').trim()) return 'Add a warranty number.';
            if (!isISODate(d.completedDate)) return 'Add the completion date.';
            return null;
        },
    });
    const { data: d, update } = form;

    return (
        <FormShell
            title="Warranty"
            subtitle={[d.warrantyNumber, d.clientName].filter(Boolean).join(' · ') || 'New warranty'}
            icon={WarrantyIcon}
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
            preview={{ formType: FormType.Warranty, data: d, profile, job }}
            actions={(
                <>
                    <AIFillButton jobId={job.id} formType={FormType.Warranty} onApply={form.applyDraft} compact />
                    <ShareButton ensureSaved={form.ensureSaved} onOpen={() => setShareOpen(true)} />
                </>
            )}
        >
            <FormSection title="Warranty details" icon={ShieldCheckIcon}>
                <FieldGrid>
                    <TextField label="Warranty #" value={d.warrantyNumber} onChange={v => update({ warrantyNumber: v })} />
                    <DateField label="Work completed on" value={d.completedDate} onChange={v => update({ completedDate: v })} />
                    <TextField label="Duration" value={d.duration} onChange={v => update({ duration: v })} list="warranty-durations" placeholder="e.g. 1 Year" />
                    <TextField label="Title (optional)" value={d.title} onChange={v => update({ title: v })} placeholder="e.g. Roof replacement warranty" />
                </FieldGrid>
                <datalist id="warranty-durations">{DURATIONS.map(x => <option key={x} value={x} />)}</datalist>
            </FormSection>

            <ClientSection
                clients={clients}
                job={job}
                clientId={d.clientId}
                clientName={d.clientName}
                address={d.projectAddress}
                addressKey="projectAddress"
                addressLabel="Property address"
                nameLabel="Issued to"
                title="Customer & property"
                description="Who is covered and where the work was done."
                onChange={patch => update(patch as Partial<WarrantyState>)}
            />

            <FormSection title="Coverage" description="What is and isn’t covered.">
                <TextAreaField label="Coverage" value={d.coverage} onChange={v => update({ coverage: v })} rows={5} />
                <TextAreaField label="Conditions & exclusions" value={d.conditions} onChange={v => update({ conditions: v })} rows={5} />
            </FormSection>

            <FormSection title="Branding" description="Logo printed on this certificate." icon={BriefcaseIcon}>
                <LogoField value={d.logoUrl} onChange={url => update({ logoUrl: url })} onUploadImage={onUploadImage} hint="Uses your profile logo unless you upload a different one here." />
            </FormSection>

            <AIInsightsSection data={d.ai_visual_data} onRemove={() => update({ ai_visual_data: undefined })} />

            <SignatureSection value={d.signatureUrl} onChange={url => update({ signatureUrl: url })} profile={profile} title="Authorized signature" />

            <TemplateSection templateId={d.templateId} themeColors={d.themeColors} onChange={patch => update(patch)} />

            <ShareModal
                isOpen={shareOpen}
                onClose={() => setShareOpen(false)}
                data={d}
                docType={FormType.Warranty}
                profile={profile}
                documentId={documentId ?? form.lastSaveResult?.id}
                clients={clients}
                job={job}
                hasUnsavedChanges={form.isDirty}
                onDownload={form.download}
                getPdfDataUri={async () => String(await generateWarrantyPDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID, true) || '')}
            />
        </FormShell>
    );
};

export default WarrantyForm;
