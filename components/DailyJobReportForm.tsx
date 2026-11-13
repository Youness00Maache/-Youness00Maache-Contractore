import React, { useRef } from 'react';
import { FormType, type DailyJobReportData, type UserProfile, type Job, type Client } from '../types.ts';
import { generateDailyJobReportPDF } from '../services/pdfGenerator.ts';
import { toNumber } from '../utils/money.ts';
import { DailyReportIcon, FileTextIcon, SunIcon, EditIcon, ListIcon } from './Icons.tsx';
import { FormShell } from './forms/FormShell.tsx';
import { DateField, FieldGrid, FormSection, NumberField, TagsField, TextField } from './forms/Fields.tsx';
import { AIInsightsSection, ClientSection, CompanySection, SignatureSection, TemplateSection } from './forms/Sections.tsx';
import RichTextEditor, { type RichTextEditorHandle } from './forms/RichTextEditor.tsx';
import AIFillButton from './forms/AIFillButton.tsx';
import { backfillCompany, DEFAULT_TEMPLATE_ID, DEFAULT_THEME, useDocumentForm, useProfileLogoSync, type SaveHandler } from './forms/useDocumentForm.ts';
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

/** Same sections the AI writes (utils/richTextHtml.ts), as an empty outline to fill in. */
const REPORT_OUTLINE = ['Work completed', 'Crew & labor', 'Materials', 'Equipment', 'Delays & issues', 'Safety', 'Next steps']
    .map(title => `<h3>${title.replace('&', '&amp;')}</h3><ul><li><br></li></ul>`)
    .join('');

/** Optional count: empty / 0 is stored as "not set" so the PDF doesn't print a 0 card. */
const optionalNumber = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = toNumber(v);
    return n > 0 ? n : undefined;
};

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
            reportNumber: d.reportNumber ?? '',
            clientName: d.clientName ?? '',
            projectName: d.projectName ?? '',
            projectAddress: d.projectAddress ?? '',
            weather: d.weather ?? '',
            temperature: d.temperature ?? '',
            crewSize: optionalNumber(d.crewSize),
            laborHours: optionalNumber(d.laborHours),
            content: d.content ?? '',
            tags: Array.isArray(d.tags) ? d.tags : [],
            signatureUrl: d.signatureUrl ?? '',
        }, profile),
        prepare: d => ({
            ...d,
            content: editorRef.current ? editorRef.current.getHtml() : sanitizeEditorHtml(d.content),
            crewSize: optionalNumber(d.crewSize),
            laborHours: optionalNumber(d.laborHours),
        }),
        // Like the original app only a valid date is needed; the report number is optional.
        validate: d => (isISODate(d.date) ? null : 'Add a valid date.'),
    });
    const { data: d, update } = form;
    useProfileLogoSync(form, profile.logoUrl);

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
                    <TextField label="Report # (optional)" value={d.reportNumber} onChange={v => update({ reportNumber: v })} />
                    <DateField label="Date" value={d.date} onChange={v => update({ date: v })} />
                    <TextField label="Title (optional)" value={d.title} onChange={v => update({ title: v })} placeholder="e.g. Framing – day 3" fieldClassName="sm:col-span-2" hint="Shown in your document list." />
                </FieldGrid>
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

            <FormSection title="Site conditions & crew" description="Optional. Each one is printed as a card at the top of the report when filled in." icon={SunIcon}>
                <FieldGrid>
                    <TextField label="Weather" value={d.weather} onChange={v => update({ weather: v })} list="dr-weather" placeholder="e.g. Sunny" />
                    <TextField label="Temperature" value={d.temperature} onChange={v => update({ temperature: v })} placeholder="e.g. 72°F / 22°C" />
                    <NumberField label="Crew on site" value={d.crewSize ?? ''} decimals={0} onValueChange={v => update({ crewSize: v > 0 ? Math.round(v) : undefined })} placeholder="e.g. 4" />
                    <NumberField label="Labor hours (total)" value={d.laborHours ?? ''} onValueChange={v => update({ laborHours: v > 0 ? v : undefined })} placeholder="e.g. 32" suffix="h" />
                </FieldGrid>
                <datalist id="dr-weather">{WEATHER.map(w => <option key={w} value={w} />)}</datalist>
            </FormSection>

            <FormSection
                title="Report"
                description="Work completed, crew, materials, equipment, delays and next steps. Add site photos with the camera or Photo buttons."
                icon={EditIcon}
                actions={(
                    <button
                        type="button"
                        className="btn btn-outline btn-sm min-h-[40px]"
                        onClick={() => editorRef.current?.insertHtml(REPORT_OUTLINE)}
                        title="Insert headings for Work completed, Crew & labor, Materials, Equipment, Delays & issues, Safety and Next steps"
                    >
                        <ListIcon className="h-4 w-4" /> Add report sections
                    </button>
                )}
            >
                <RichTextEditor
                    ref={editorRef}
                    value={d.content}
                    onChange={html => update({ content: html })}
                    onUploadImage={onUploadImage}
                    placeholder="What happened on site today? Tip: “Add report sections” gives you a ready-made outline."
                    minHeight={360}
                    ariaLabel="Daily report"
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
