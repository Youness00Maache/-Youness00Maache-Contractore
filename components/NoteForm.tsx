import React, { useRef, useState } from 'react';
import { FormType, type NoteData, type UserProfile, type Job } from '../types.ts';
import { generateNotePDF } from '../services/pdfGenerator.ts';
import { NoteIcon, EditIcon } from './Icons.tsx';
import ShareModal from './ShareModal.tsx';
import ShareButton from './forms/ShareButton.tsx';
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
    /** When the note was created (printed as its date). */
    createdAt?: string;
}

const NoteForm: React.FC<NoteFormProps> = ({ profile, job, note, data, onSave, onBack, onUploadImage, prefillData, documentId, createdAt }) => {
    const editorRef = useRef<RichTextEditorHandle>(null);
    const [shareOpen, setShareOpen] = useState(false);
    const saved = note ?? data ?? null;

    const form = useDocumentForm<NoteData>({
        formType: FormType.Note,
        initial: saved,
        prefillData,
        onSave,
        download: d => generateNotePDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID, false, { createdAt }),
        makeDefaults: () => ({ title: '', content: '', tags: [], templateId: DEFAULT_TEMPLATE_ID, themeColors: { ...DEFAULT_THEME } }),
        hydrate: d => ({ ...d, title: d.title ?? '', content: d.content ?? '', tags: Array.isArray(d.tags) ? d.tags : [] }),
        prepare: d => ({ ...d, content: editorRef.current ? editorRef.current.getHtml() : sanitizeEditorHtml(d.content) }),
        // a photo-only or checklist-only note is fine (as in the original app)
        validate: d => (String(d.title || '').trim() || String(d.content || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() || /<(img|table|hr)\b/i.test(String(d.content || ''))
            ? null
            : 'Add a title, some text or a photo first.'),
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
            actions={<ShareButton ensureSaved={form.ensureSaved} onOpen={() => setShareOpen(true)} />}
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

            <ShareModal
                isOpen={shareOpen}
                onClose={() => setShareOpen(false)}
                data={d}
                docType={FormType.Note}
                profile={profile}
                documentId={documentId ?? form.lastSaveResult?.id}
                job={job}
                hasUnsavedChanges={form.isDirty}
                onDownload={form.download}
                getPdfDataUri={async () => {
                    const current = { ...d, content: editorRef.current ? editorRef.current.getHtml() : d.content };
                    return String(await generateNotePDF(profile, job, current, current.templateId || DEFAULT_TEMPLATE_ID, true, { createdAt }) || '');
                }}
            />
        </FormShell>
    );
};

export default NoteForm;
