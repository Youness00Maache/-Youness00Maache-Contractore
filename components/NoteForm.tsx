import React, { useRef } from 'react';
import { FormType, type NoteData, type UserProfile, type Job } from '../types.ts';
import { generateNotePDF } from '../services/pdfGenerator.ts';
import { NoteIcon, EditIcon } from './Icons.tsx';
import { FormShell } from './forms/FormShell.tsx';
import { FormSection, TagsField, TextField } from './forms/Fields.tsx';
import { TemplateSection } from './forms/Sections.tsx';
import RichTextEditor, { type RichTextEditorHandle } from './forms/RichTextEditor.tsx';
import { DEFAULT_TEMPLATE_ID, DEFAULT_THEME, useDocumentForm, type SaveHandler } from './forms/useDocumentForm.ts';
import { sanitizeEditorHtml } from './forms/formUtils.ts';

interface NoteFormProps {
    profile: UserProfile;
    job: Job;
    note?: NoteData | null;
    data?: NoteData | null;
    onSave: SaveHandler<NoteData>;
    onBack: () => void;
    onUploadImage?: (file: File) => Promise<string>;
    prefillData?: unknown;
    documentId?: string;
    existingNumbers?: string[];
}

const NoteForm: React.FC<NoteFormProps> = ({ profile, job, note, data, onSave, onBack, onUploadImage, prefillData }) => {
    const editorRef = useRef<RichTextEditorHandle>(null);
    const saved = note ?? data ?? null;

    const form = useDocumentForm<NoteData>({
        formType: FormType.Note,
        initial: saved,
        prefillData,
        onSave,
        download: d => generateNotePDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID),
        makeDefaults: () => ({ title: '', content: '', tags: [], templateId: DEFAULT_TEMPLATE_ID, themeColors: { ...DEFAULT_THEME } }),
        hydrate: d => ({ ...d, title: d.title ?? '', content: d.content ?? '', tags: Array.isArray(d.tags) ? d.tags : [] }),
        prepare: d => ({ ...d, content: editorRef.current ? editorRef.current.getHtml() : sanitizeEditorHtml(d.content) }),
        validate: d => (String(d.title || '').trim() || String(d.content || '').replace(/<[^>]+>/g, '').trim() ? null : 'Add a title or some text first.'),
    });
    const { data: d, update } = form;

    return (
        <FormShell
            title="Note"
            subtitle={d.title || job.name || 'New note'}
            icon={NoteIcon}
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
            preview={{ formType: FormType.Note, data: d, profile, job }}
        >
            <FormSection title="Note" icon={EditIcon}>
                <TextField label="Title" value={d.title} onChange={v => update({ title: v })} placeholder="e.g. Site walk-through with the owner" className="text-base font-semibold" />
                <div>
                    <span className="label">Content</span>
                    <RichTextEditor ref={editorRef} value={d.content} onChange={html => update({ content: html })} onUploadImage={onUploadImage} placeholder="Write your note, add photos, or dictate with the mic…" />
                </div>
                <TagsField label="Tags" value={d.tags} onChange={tags => update({ tags })} />
            </FormSection>

            <TemplateSection templateId={d.templateId} themeColors={d.themeColors} onChange={patch => update(patch)} />
        </FormShell>
    );
};

export default NoteForm;
