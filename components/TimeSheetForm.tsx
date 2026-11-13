import React, { useState } from 'react';
import { FormType, type TimeSheetData, type UserProfile, type Job, type Client } from '../types.ts';
import { generateTimeSheetPDF } from '../services/pdfGenerator.ts';
import { roundMoney, toNumber } from '../utils/money.ts';
import { TimeSheetIcon, ClockIcon } from './Icons.tsx';
import ShareModal from './ShareModal.tsx';
import ShareButton from './forms/ShareButton.tsx';
import { FormShell } from './forms/FormShell.tsx';
import { DateField, FieldGrid, FormSection, NumberField, SelectField, TextAreaField, TextField } from './forms/Fields.tsx';
import { ClientSection, CompanySection, SignatureSection, SummaryRow, TemplateSection } from './forms/Sections.tsx';
import { backfillCompany, DEFAULT_TEMPLATE_ID, DEFAULT_THEME, useDocumentForm, type SaveHandler } from './forms/useDocumentForm.ts';
import { formatDisplayDate, isISODate, todayISO } from './forms/formUtils.ts';
import { STATUS_OPTIONS } from './forms/documentFields.ts';

interface Props {
    job: Job;
    profile: UserProfile;
    data: TimeSheetData | null;
    clients?: Client[];
    onSave: SaveHandler<TimeSheetData>;
    onBack: () => void;
    onUploadImage?: (file: File) => Promise<string>;
    prefillData?: unknown;
    documentId?: string;
    existingNumbers?: string[];
}

const TimeSheetForm: React.FC<Props> = ({ job, profile, data, clients = [], onSave, onBack, onUploadImage, prefillData, documentId }) => {
    const [shareOpen, setShareOpen] = useState(false);
    const form = useDocumentForm<TimeSheetData>({
        formType: FormType.TimeSheet,
        initial: data,
        prefillData,
        onSave,
        download: d => generateTimeSheetPDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID),
        makeDefaults: () => ({
            title: '',
            workerName: job.workerName || profile.name || '',
            date: todayISO(),
            hoursWorked: 8,
            overtimeHours: 0,
            notes: '',
            status: 'Draft',
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
        hydrate: d => backfillCompany({ ...d, hoursWorked: toNumber(d.hoursWorked), overtimeHours: toNumber(d.overtimeHours), notes: d.notes ?? '', status: d.status || 'Draft' }, profile),
        // Worker and hours are optional and uncapped (as in the original app): a sheet may cover a whole week or a crew.
        validate: d => (isISODate(d.date) ? null : 'Add a valid date.'),
    });
    const { data: d, update } = form;
    const total = roundMoney(toNumber(d.hoursWorked) + toNumber(d.overtimeHours)); // same rounding as the PDF

    return (
        <FormShell
            title="Time sheet"
            subtitle={[d.workerName, d.date ? formatDisplayDate(d.date) : ''].filter(Boolean).join(' · ') || 'New time sheet'}
            icon={TimeSheetIcon}
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
            preview={{ formType: FormType.TimeSheet, data: d, profile, job }}
            actions={<ShareButton ensureSaved={form.ensureSaved} onOpen={() => setShareOpen(true)} />}
        >
            <FormSection title="Hours" description="Time worked on this job: one day, a week or any period." icon={ClockIcon}>
                <FieldGrid>
                    <TextField label="Worker" value={d.workerName} onChange={v => update({ workerName: v })} autoComplete="name" />
                    <DateField label="Date" value={d.date} onChange={v => update({ date: v })} hint="For a weekly sheet, use the week’s first or last day." />
                    <NumberField label="Regular hours" value={d.hoursWorked} onValueChange={v => update({ hoursWorked: v })} suffix="h" />
                    <NumberField label="Overtime hours" value={d.overtimeHours} onValueChange={v => update({ overtimeHours: v })} suffix="h" />
                    <SelectField label="Status" value={d.status} options={STATUS_OPTIONS.timeSheet} onChange={v => update({ status: v })} />
                    <TextField label="Title (optional)" value={d.title} onChange={v => update({ title: v })} placeholder="e.g. Framing crew – Monday" />
                </FieldGrid>
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                    <SummaryRow label="Total hours" value={`${total} h`} strong />
                </div>
                <TextAreaField label="Notes" value={d.notes} onChange={v => update({ notes: v })} rows={3} placeholder="Tasks completed, breaks, travel…" />
            </FormSection>

            <ClientSection
                clients={clients}
                job={job}
                clientId={(d as any).clientId}
                clientName={d.clientName}
                address={d.clientAddress}
                onChange={patch => update(patch as Partial<TimeSheetData>)}
            />

            <CompanySection data={d} onChange={patch => update(patch)} onUploadImage={onUploadImage} />

            <SignatureSection value={d.signatureUrl} onChange={url => update({ signatureUrl: url })} profile={profile} title="Signature" description="Worker or supervisor signature." />

            <TemplateSection templateId={d.templateId} themeColors={d.themeColors} onChange={patch => update(patch)} />

            <ShareModal
                isOpen={shareOpen}
                onClose={() => setShareOpen(false)}
                data={d}
                docType={FormType.TimeSheet}
                profile={profile}
                documentId={documentId ?? form.lastSaveResult?.id}
                clients={clients}
                job={job}
                hasUnsavedChanges={form.isDirty}
                onDownload={form.download}
                getPdfDataUri={async () => String(await generateTimeSheetPDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID, true) || '')}
            />
        </FormShell>
    );
};

export default TimeSheetForm;
