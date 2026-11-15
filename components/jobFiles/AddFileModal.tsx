/**
 * Job page › Files: "Add file" (one picked file) and "Add link" in one small window: name, category (guessed from the
 * file name), tags, a note and, when the client portal can show it, "Show in client portal". Also exports the field
 * block the document window reuses (FileFields).
 */
import React, { useMemo, useState } from 'react';
import { describeError, planLimitMessage } from '../../lib/account.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { addJobFile, addJobLink, isPlanLimitError, setJobFileShared } from '../../lib/jobFiles/jobFilesApi.ts';
import {
    canShareInPortal, formatBytes, guessCategory, mimeFor, normalizeTags, shareBlockReason, titleFromFileName, validateLink,
} from '../../lib/jobFiles/jobFileLogic.ts';
import { JOB_FILE_CATEGORIES, JOB_FILE_LIMITS, type JobFile, type JobFileCategory } from '../../lib/jobFiles/jobFileTypes.ts';
import { Field, Modal } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { SwitchRow } from './ui.tsx';

export interface FileFieldsValue { title: string; category: JobFileCategory; tags: string; notes: string; url: string }

/** Title, category, tags and note (+ the address of a link). Controlled by its parent. */
export const FileFields: React.FC<{
    value: FileFieldsValue;
    onChange: (next: FileFieldsValue) => void;
    link?: boolean;
    titleHint?: string;
    disabled?: boolean;
    urlError?: string;
}> = ({ value, onChange, link = false, titleHint, disabled, urlError }) => {
    const set = (patch: Partial<FileFieldsValue>) => onChange({ ...value, ...patch });
    const tagList = useMemo(() => normalizeTags(value.tags), [value.tags]);
    return (
        <div className="space-y-3.5">
            {link && (
                <Field label="Link" htmlFor="jf-url" error={urlError}>
                    <input id="jf-url" className="input" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://drive.google.com/…" value={value.url} onChange={e => set({ url: e.target.value })} disabled={disabled} maxLength={JOB_FILE_LIMITS.url} />
                </Field>
            )}
            <Field label="Name" htmlFor="jf-title">
                <input id="jf-title" className="input" value={value.title} placeholder={titleHint} onChange={e => set({ title: e.target.value })} disabled={disabled} maxLength={JOB_FILE_LIMITS.title} />
            </Field>
            <Field label="Category" htmlFor="jf-category">
                <select id="jf-category" className="input" value={value.category} onChange={e => set({ category: e.target.value as JobFileCategory })} disabled={disabled}>
                    {JOB_FILE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
            </Field>
            <Field label="Tags" htmlFor="jf-tags" hint="Separate with commas, e.g. kitchen, rev B">
                <input id="jf-tags" className="input" value={value.tags} placeholder="kitchen, rev B" onChange={e => set({ tags: e.target.value })} disabled={disabled} />
                {tagList.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs font-medium text-muted-foreground">{tagList.map(t => <span key={t}>#{t}</span>)}</p>
                )}
            </Field>
            <Field label="Note" htmlFor="jf-notes">
                <textarea id="jf-notes" className="input min-h-[72px]" rows={3} value={value.notes} placeholder="Only you see this" onChange={e => set({ notes: e.target.value })} disabled={disabled} maxLength={JOB_FILE_LIMITS.notes} />
            </Field>
        </div>
    );
};

export const AddFileModal: React.FC<{
    /** the picked file; null = a link */
    file: File | null;
    userId: string;
    jobId: string;
    isOnline: boolean;
    onClose: () => void;
    onAdded: (saved: JobFile) => void;
    onUpgrade: (reason?: string) => void;
}> = ({ file, userId, jobId, isOnline, onClose, onAdded, onUpgrade }) => {
    const link = !file;
    const [v, setV] = useState<FileFieldsValue>(() => ({
        title: file ? titleFromFileName(file.name) : '',
        category: file ? guessCategory(file.name, file.type) : 'other',
        tags: '', notes: '', url: '',
    }));
    const [share, setShare] = useState(false);
    const [busy, setBusy] = useState(false);
    const [urlError, setUrlError] = useState('');

    const sharable = link || (!!file && canShareInPortal({ kind: 'file', mime: mimeFor(file.name, file.type), sizeBytes: file.size }));
    const blocked = file ? shareBlockReason({ kind: 'file', mime: mimeFor(file.name, file.type), sizeBytes: file.size }) : null;
    const submit = async () => {
        if (busy) return;
        if (!isOnline) { toast.error(NEEDS_CONNECTION); return; }
        if (link) {
            const check = validateLink(v.url);
            if (!check.ok) { setUrlError(check.error); return; }
        }
        setUrlError('');
        setBusy(true);
        try {
            const tags = normalizeTags(v.tags);
            let saved: JobFile;
            if (link) {
                saved = await addJobLink(userId, jobId, { url: v.url, title: v.title, category: v.category, notes: v.notes, tags, shared: share });
            } else {
                saved = await addJobFile(userId, jobId, { file: file!, fileName: file!.name, title: v.title, category: v.category, notes: v.notes, tags });
                if (share && sharable) {
                    try { saved = await setJobFileShared(saved, true, userId); } catch (e) { toast.error(`Added, but it is not shown to the client yet: ${describeError(e, 'try again from the file.')}`); }
                }
            }
            onAdded(saved);
            toast.success(link ? 'Link added.' : 'File added.');
            onClose();
        } catch (e) {
            if (isPlanLimitError(e)) onUpgrade(planLimitMessage(e));
            else toast.error(describeError(e, link ? 'The link could not be added.' : 'The file could not be added.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            title={link ? 'Add a link' : 'Add a file'}
            description={file ? `${file.name} · ${formatBytes(file.size)}` : 'Google Drive, Dropbox, a 3D walkthrough, a supplier page…'}
            footer={(
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={() => { void submit(); }} disabled={busy || (link && !v.url.trim())}>{busy ? 'Adding…' : link ? 'Add link' : 'Add file'}</button>
                </>
            )}
        >
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
                <FileFields value={v} onChange={setV} link={link} titleHint={link ? 'Taken from the link if you leave it empty' : undefined} disabled={busy} urlError={urlError} />
                <div className="border-t border-border/70 pt-3.5">
                    <SwitchRow
                        checked={share && sharable}
                        onChange={setShare}
                        label="Show in client portal"
                        disabled={busy || !sharable}
                        hint={sharable ? 'Your client sees it on their project page.' : blocked}
                    />
                </div>
            </form>
        </Modal>
    );
};

export default AddFileModal;
