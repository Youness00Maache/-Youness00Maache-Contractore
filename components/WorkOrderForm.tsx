import React, { useState } from 'react';
import { FormType, type WorkOrderData, type UserProfile, type Job, type Client } from '../types.ts';
import { generateWorkOrderPDF } from '../services/pdfGenerator.ts';
import { toNumber } from '../utils/money.ts';
import { WorkOrderIcon, FileTextIcon, ClockIcon } from './Icons.tsx';
import ShareModal from './ShareModal.tsx';
import ShareButton from './forms/ShareButton.tsx';
import { FormShell } from './forms/FormShell.tsx';
import { DateField, FieldGrid, FormSection, MoneyField, NumberField, SelectField, TextAreaField, TextField } from './forms/Fields.tsx';
import { AIInsightsSection, ClientSection, CompanySection, SignatureSection, TemplateSection } from './forms/Sections.tsx';
import AIFillButton from './forms/AIFillButton.tsx';
import { backfillCompany, DEFAULT_TEMPLATE_ID, DEFAULT_THEME, useDocumentForm, type SaveHandler } from './forms/useDocumentForm.ts';
import { isISODate, todayISO } from './forms/formUtils.ts';
import { STATUS_OPTIONS } from './forms/documentFields.ts';

interface Props {
    job: Job;
    profile: UserProfile;
    data: WorkOrderData | null;
    clients?: Client[];
    onSave: SaveHandler<WorkOrderData>;
    onBack: () => void;
    onUploadImage?: (file: File) => Promise<string>;
    prefillData?: unknown;
    documentId?: string;
    existingNumbers?: string[];
}

const WorkOrderForm: React.FC<Props> = ({ job, profile, data, clients = [], onSave, onBack, onUploadImage, prefillData, documentId, existingNumbers }) => {
    const [shareOpen, setShareOpen] = useState(false);
    // "Assigned to" suggestions: the job's worker first, then you
    const assigneeSuggestions = Array.from(new Set([job.workerName, profile.name].map(n => String(n || '').trim()).filter(Boolean)));
    const form = useDocumentForm<WorkOrderData>({
        formType: FormType.WorkOrder,
        initial: data,
        prefillData,
        onSave,
        existingNumbers,
        download: d => generateWorkOrderPDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID),
        makeDefaults: () => ({
            title: '',
            workOrderNumber: '',
            date: todayISO(),
            status: 'Scheduled',
            assignedTo: job.workerName || '',
            description: '',
            materialsUsed: '',
            hours: 0,
            cost: 0,
            terms: 'Payment is due upon completion of work. Any changes to the scope of work must be approved in writing.',
            companyName: profile.companyName || '',
            companyAddress: profile.address || '',
            companyPhone: profile.phone || '',
            companyWebsite: profile.website || '',
            clientName: job.clientName || '',
            clientAddress: job.clientAddress || '',
            signatureUrl: '',
            logoUrl: profile.logoUrl || '',
            templateId: DEFAULT_TEMPLATE_ID,
            themeColors: { ...DEFAULT_THEME },
        }),
        hydrate: d => backfillCompany({
            ...d,
            hours: toNumber(d.hours),
            cost: toNumber(d.cost),
            description: d.description ?? '',
            materialsUsed: d.materialsUsed ?? '',
            terms: d.terms ?? '',
            assignedTo: d.assignedTo ?? '',
            status: (STATUS_OPTIONS.workOrder as readonly string[]).includes(d.status) ? d.status : 'Scheduled',
        }, profile),
        validate: d => {
            if (!String(d.workOrderNumber || '').trim()) return 'Add a work order number.';
            if (!isISODate(d.date)) return 'Add a valid date.';
            return null;
        },
    });
    const { data: d, update } = form;

    return (
        <FormShell
            title="Work order"
            subtitle={[d.workOrderNumber, d.clientName].filter(Boolean).join(' · ') || 'New work order'}
            icon={WorkOrderIcon}
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
            preview={{ formType: FormType.WorkOrder, data: d, profile, job }}
            actions={(
                <>
                    <AIFillButton jobId={job.id} formType={FormType.WorkOrder} onApply={form.applyDraft} compact />
                    <ShareButton ensureSaved={form.ensureSaved} onOpen={() => setShareOpen(true)} />
                </>
            )}
        >
            <FormSection title="Work order details" icon={FileTextIcon}>
                <FieldGrid>
                    <TextField label="Work order #" value={d.workOrderNumber} onChange={v => update({ workOrderNumber: v })} />
                    <SelectField label="Status" value={d.status} options={STATUS_OPTIONS.workOrder} onChange={v => update({ status: v as WorkOrderData['status'] })} />
                    <DateField label="Date" value={d.date} onChange={v => update({ date: v })} />
                    <TextField
                        label="Assigned to"
                        value={d.assignedTo}
                        onChange={v => update({ assignedTo: v })}
                        list="wo-assignees"
                        placeholder={job.workerName ? `e.g. ${job.workerName}` : 'Worker or crew'}
                        autoComplete="off"
                        hint={job.workerName && d.assignedTo !== job.workerName ? <>Job worker: <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => update({ assignedTo: job.workerName })}>{job.workerName}</button></> : undefined}
                    />
                    <TextField label="Title (optional)" value={d.title} onChange={v => update({ title: v })} placeholder="e.g. Replace water heater" />
                </FieldGrid>
                <datalist id="wo-assignees">{assigneeSuggestions.map(n => <option key={n} value={n} />)}</datalist>
            </FormSection>

            <ClientSection
                clients={clients}
                job={job}
                clientId={(d as any).clientId}
                clientName={d.clientName}
                address={d.clientAddress}
                addressLabel="Service address"
                onChange={patch => update(patch as Partial<WorkOrderData>)}
            />

            <CompanySection data={d} onChange={patch => update(patch)} onUploadImage={onUploadImage} />

            <FormSection title="Scope of work" description="What needs to be done and what was used." icon={ClockIcon}>
                <TextAreaField label="Description of work" value={d.description} onChange={v => update({ description: v })} rows={5} placeholder="Tasks, location, special instructions…" />
                <TextAreaField label="Materials used" value={d.materialsUsed} onChange={v => update({ materialsUsed: v })} rows={3} placeholder="One per line" />
                <FieldGrid>
                    <NumberField label="Labor hours" value={d.hours} onValueChange={v => update({ hours: v })} suffix="h" />
                    <MoneyField label="Estimated cost" value={d.cost} onValueChange={v => update({ cost: v })} />
                </FieldGrid>
            </FormSection>

            <FormSection title="Terms" description="Printed on the work order.">
                <TextAreaField label="Terms & conditions" value={d.terms} onChange={v => update({ terms: v })} rows={3} />
            </FormSection>

            <AIInsightsSection data={d.ai_visual_data} onRemove={() => update({ ai_visual_data: undefined })} />

            <SignatureSection value={d.signatureUrl} onChange={url => update({ signatureUrl: url })} profile={profile} />

            <TemplateSection templateId={d.templateId} themeColors={d.themeColors} onChange={patch => update(patch)} />

            <ShareModal
                isOpen={shareOpen}
                onClose={() => setShareOpen(false)}
                data={d}
                docType={FormType.WorkOrder}
                profile={profile}
                documentId={documentId ?? form.lastSaveResult?.id}
                clients={clients}
                job={job}
                hasUnsavedChanges={form.isDirty}
                onDownload={form.download}
                getPdfDataUri={async () => String(await generateWorkOrderPDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID, true) || '')}
            />
        </FormShell>
    );
};

export default WorkOrderForm;
