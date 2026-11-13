import React, { useRef } from 'react';
import { FormType, type DailyJobReportData, type UserProfile, type Job, type Client } from '../types.ts';
import { generateDailyJobReportPDF } from '../services/pdfGenerator.ts';
import { DailyReportIcon, FileTextIcon, SunIcon, EditIcon } from './Icons.tsx';
import { FormShell } from './forms/FormShell.tsx';
import { DateField, FieldGrid, FormSection, TagsField, TextField } from './forms/Fields.tsx';
import { AIInsightsSection, ClientSection, CompanySection, SignatureSection, TemplateSection } from './forms/Sections.tsx';
import RichTextEditor, { type RichTextEditorHandle } from './forms/RichTextEditor.tsx';
import AIFillButton from './forms/AIFillButton.tsx';
import { backfillCompany, DEFAULT_TEMPLATE_ID, DEFAULT_THEME, useDocumentForm, type SaveHandler } from './forms/useDocumentForm.ts';
import { isISODate, sanitizeEditorHtml, todayISO } from './forms/formUtils.ts';

interface DailyJobReportFormProps {
    profile: UserProfile;
    job: Job;
    clients?: Client[];
    report?: DailyJobReportData | null;
    data?: DailyJobReportData | null;
    onSave: SaveHandler<DailyJobReportData>;
    onBack: () => void;
    onUploadImage?: (file: File) => Promise<string>;
    prefillData?: unknown;
    documentId?: string;
    existingNumbers?: string[];
}

type ReportState = DailyJobReportData & { clientId?: string };

const WEATHER = ['Sunny', 'Partly cloudy', 'Cloudy', 'Rain', 'Storms', 'Snow', 'Windy', 'Fog', 'Hot', 'Cold'];

const DailyJobReportForm: React.FC<DailyJobReportFormProps> = ({ profile, job, clients = [], report, data, onSave, onBack, onUploadImage, prefillData, existingNumbers }) => {
    const editorRef = useRef<RichTextEditorHandle>(null);
    const saved = (report ?? data ?? null) as ReportState | null;

    const form = useDocumentForm<ReportState>({
        formType: FormType.DailyJobReport,
        initial: saved,
        prefillData,
        onSave: onSave as SaveHandler<ReportState>,
        existingNumbers,
        download: d => generateDailyJobReportPDF(profile, d, d.templateId || DEFAULT_TEMPLATE_ID),
        makeDefaults: () => ({
            title: '',
            reportNumber: '',
            date: todayISO(),
            weather: '',
            temperature: '',
            content: '',
            tags: [],
            projectName: job.name || '',
            projectAddress: job.clientAddress || '',
            clientName: job.clientName || '',
            companyName: profile.companyName || '',
            companyAddress: profile.address || '',
            companyPhone: profile.phone || '',
            companyWebsite: profile.website || '',
            logoUrl: profile.logoUrl || '',
            signatureUrl: '',
            templateId: DEFAULT_TEMPLATE_ID,
            themeColors: { ...DEFAULT_THEME },
        }),
        hydrate: d => backfillCompany({
            ...d,
            clientName: d.clientName ?? '',
            projectName: d.projectName ?? '',
            projectAddress: d.projectAddress ?? '',
            weather: d.weather ?? '',
            temperature: d.temperature ?? '',
            content: d.content ?? '',
            tags: Array.isArray(d.tags) ? d.tags : [],
            signatureUrl: d.signatureUrl ?? '',
        }, profile),
        prepare: d => ({ ...d, content: editorRef.current ? editorRef.current.getHtml() : sanitizeEditorHtml(d.content) }),
        validate: d => {
            if (!String(d.reportNumber || '').trim()) return 'Add a report number.';
            if (!isISODate(d.date)) return 'Add a valid date.';
            return null;
        },
    });
    const { data: d, update } = form;

    return (
        <FormShell
            title="Daily report"
            subtitle={[d.reportNumber, d.projectName].filter(Boolean).join(' · ') || 'New daily report'}
            icon={DailyReportIcon}
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
            preview={{ formType: FormType.DailyJobReport, data: d, profile, job }}
            actions={<AIFillButton jobId={job.id} formType={FormType.DailyJobReport} onApply={form.applyDraft} compact />}
        >
            <FormSection title="Report details" icon={FileTextIcon}>
                <FieldGrid>
                    <TextField label="Report #" value={d.reportNumber} onChange={v => update({ reportNumber: v })} />
                    <DateField label="Date" value={d.date} onChange={v => update({ date: v })} />
                    <TextField label="Title (optional)" value={d.title} onChange={v => update({ title: v })} placeholder="e.g. Framing – day 3" fieldClassName="sm:col-span-2" />
                </FieldGrid>
            </FormSection>

            <FormSection title="Site conditions" description="Printed only when filled in." icon={SunIcon}>
                <FieldGrid>
                    <TextField label="Weather" value={d.weather} onChange={v => update({ weather: v })} list="dr-weather" placeholder="e.g. Sunny" />
                    <TextField label="Temperature" value={d.temperature} onChange={v => update({ temperature: v })} placeholder="e.g. 72°F / 22°C" />
                </FieldGrid>
                <datalist id="dr-weather">{WEATHER.map(w => <option key={w} value={w} />)}</datalist>
            </FormSection>

            <ClientSection
                clients={clients}
                job={job}
                clientId={d.clientId}
                clientName={d.clientName}
                address={d.projectAddress}
                addressKey="projectAddress"
                addressLabel="Project address"
                title="Project & client"
                description="Where the work happened and for whom."
                onChange={patch => update(patch as Partial<ReportState>)}
            >
                <TextField label="Project name" value={d.projectName} onChange={v => update({ projectName: v })} fieldClassName="sm:col-span-2" />
            </ClientSection>

            <FormSection title="Report" description="Work completed, crew, deliveries, issues and next steps. Add photos from the site." icon={EditIcon}>
                <RichTextEditor
                    ref={editorRef}
                    value={d.content}
                    onChange={html => update({ content: html })}
                    onUploadImage={onUploadImage}
                    placeholder="What happened on site today?"
                    minHeight={360}
                />
                <TagsField label="Tags" value={d.tags} onChange={tags => update({ tags })} />
            </FormSection>

            <AIInsightsSection data={d.ai_visual_data} onRemove={() => update({ ai_visual_data: undefined })} />

            <CompanySection data={d} onChange={patch => update(patch)} onUploadImage={onUploadImage} />

            <SignatureSection value={d.signatureUrl} onChange={url => update({ signatureUrl: url })} profile={profile} title="Signed by" description="Foreman or superintendent signature (optional)." />

            <TemplateSection templateId={d.templateId} themeColors={d.themeColors} onChange={patch => update(patch)} />
        </FormShell>
    );
};

export default DailyJobReportForm;
