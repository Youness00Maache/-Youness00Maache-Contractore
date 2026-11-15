/**
 * Job page › Boards › one board: collect pictures, links, notes and colours for a room, then show it to the client.
 *  - Edit: add an image (upload, up to 5 MB; or paste an https link to a picture), a link, a note or a colour; give each
 *    item a title and a caption; move it up or down; remove it. Changes are kept in a draft until "Save changes".
 *  - Share with client: a switch. Titles and captions of shared items are visible to the client; the board notes
 *    ("Your notes") are private and never leave your account.
 *  - Client preview: the same gallery the client sees (components/boards/BoardGallery.tsx), from what is on screen now.
 * Every change to the account needs a connection (it says so).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { describeError, planLimitMessage } from '../../lib/account.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { isPlanLimitError } from '../../lib/jobFiles/jobFilesApi.ts';
import { validateHttpsLink, validateOptionImage } from '../../lib/selections/selectionLogic.ts';
import { removeBoardImageFile, setBoardShared, updateBoard, uploadBoardImage } from '../../lib/boards/boardsApi.ts';
import { addItem, moveItem, parseColor, removeItem } from '../../lib/boards/boardLogic.ts';
import { BOARD_LIMITS, type BoardItem, type BoardItemKind, type JobBoard } from '../../lib/boards/boardTypes.ts';
import {
    BOARD_PRIVATE_NOTE, BOARD_SHARE_NOTE, BOARD_SHARED_NOTE, boardSummary, itemHeading, itemKindLabel, readableOn, toGalleryItems,
} from '../../lib/boards/boardView.ts';
import { SELECTIONS_PREMIUM_REASON } from '../../lib/selections/selectionView.ts';
import { cx } from '../commsKit.tsx';
import { ConfirmDialog, Field, Segmented } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { BackArrowIcon, PlusIcon, TrashIcon, UploadImageIcon } from '../Icons.tsx';
import HelpButton from '../help/HelpButton.tsx';
import { SwitchRow, TypeStamp } from '../jobFiles/ui.tsx';
import StoredImage, { useSignedUrls } from '../selections/StoredImage.tsx';
import BoardGallery from './BoardGallery.tsx';

const KINDS: BoardItemKind[] = ['image', 'link', 'note', 'color'];

// ====================================================================================================== add an item
const ItemAdder: React.FC<{
    disabled: boolean;
    uploading: boolean;
    full: boolean;
    onUpload: (file: File) => void;
    onAdd: (input: { kind: BoardItemKind; url?: string; title?: string; caption?: string; color?: string }) => string | null;
}> = ({ disabled, uploading, full, onUpload, onAdd }) => {
    const [kind, setKind] = useState<BoardItemKind>('image');
    const [url, setUrl] = useState('');
    const [title, setTitle] = useState('');
    const [caption, setCaption] = useState('');
    const [hex, setHex] = useState('#d9cbb8');
    const [problem, setProblem] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const add = () => {
        // the link box only belongs to pictures and links: a leftover link from another kind must not block a colour or a note
        const err = onAdd({
            kind, url: (kind === 'image' || kind === 'link') && url.trim() ? url.trim() : undefined,
            title: title.trim() || undefined, caption: caption.trim() || undefined, color: kind === 'color' ? hex : undefined,
        });
        if (err) { setProblem(err); return; }
        setProblem('');
        setUrl('');
        setTitle('');
        setCaption('');
    };

    return (
        <section aria-label="Add to the board" className="rounded-xl border border-border bg-card p-3 sm:p-3.5">
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">Add to the board</p>
                {full && <p className="text-xs font-medium text-warning">The board is full ({BOARD_LIMITS.items} items).</p>}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="What to add">
                {KINDS.map(k => (
                    <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => { setKind(k); setProblem(''); setUrl(''); }}
                        className={cx('min-h-[40px] rounded-lg text-sm font-semibold transition', kind === k ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground')}>
                        {itemKindLabel(k)}
                    </button>
                ))}
            </div>

            <div className="mt-3 space-y-2.5">
                {kind === 'image' && (
                    <>
                        <button type="button" className="btn btn-outline h-12 w-full justify-center" onClick={() => fileRef.current?.click()} disabled={disabled || uploading || full}>
                            <UploadImageIcon className="h-4 w-4" /> {uploading ? 'Adding the picture…' : 'Upload a picture'}
                        </button>
                        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden
                            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(f); }} />
                        <p className="text-xs text-muted-foreground">JPG, PNG or WebP, up to 5 MB. Or paste a link to a picture:</p>
                    </>
                )}
                {(kind === 'image' || kind === 'link') && (
                    <div>
                        <label htmlFor="bd-url" className="sr-only">{kind === 'image' ? 'Link to a picture' : 'Link'}</label>
                        <input id="bd-url" className="input h-11" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={url} onChange={e => { setUrl(e.target.value); setProblem(''); }} placeholder={kind === 'image' ? 'https://… (link to a picture)' : 'https://… (a product, an idea, a showroom)'} disabled={disabled || full} />
                    </div>
                )}
                {kind === 'color' && (
                    <div className="flex items-center gap-3">
                        <label htmlFor="bd-color" className="sr-only">Pick a colour</label>
                        <input id="bd-color" type="color" className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-1" value={parseColor(hex) || '#d9cbb8'} onChange={e => setHex(e.target.value)} disabled={disabled || full} />
                        <label htmlFor="bd-hex" className="sr-only">Colour code</label>
                        <input id="bd-hex" className="input h-11 w-32 font-mono uppercase" value={hex} onChange={e => { setHex(e.target.value); setProblem(''); }} maxLength={9} placeholder="#D9CBB8" disabled={disabled || full} />
                        <span aria-hidden className="h-11 w-11 shrink-0 rounded-lg ring-1 ring-border" style={{ backgroundColor: parseColor(hex) || 'transparent' }} />
                    </div>
                )}
                {kind !== 'note' && (
                    <input className="input h-11" value={title} onChange={e => setTitle(e.target.value)} maxLength={BOARD_LIMITS.itemTitle} placeholder={kind === 'color' ? 'Name, e.g. Wall colour (optional)' : 'Title (optional)'} aria-label="Title" disabled={disabled || full} />
                )}
                {kind === 'note' && (
                    <input className="input h-11" value={title} onChange={e => setTitle(e.target.value)} maxLength={BOARD_LIMITS.itemTitle} placeholder="Heading (optional)" aria-label="Heading" disabled={disabled || full} />
                )}
                <textarea className="input min-h-[64px]" rows={2} value={caption} onChange={e => setCaption(e.target.value)} maxLength={BOARD_LIMITS.caption} placeholder={kind === 'note' ? 'Write the note' : 'Caption (optional). Your client sees it if you share the board.'} aria-label={kind === 'note' ? 'Note' : 'Caption'} disabled={disabled || full} />
                {problem && <p className="text-sm font-medium text-destructive" role="alert">{problem}</p>}
                {(kind !== 'image' || url.trim()) && (
                    <button type="button" className="btn btn-primary h-11 w-full sm:w-auto" onClick={add} disabled={disabled || full}>
                        <PlusIcon className="h-4 w-4" /> Add {kind === 'color' ? 'colour' : kind}
                    </button>
                )}
            </div>
        </section>
    );
};

// ====================================================================================================== one item
const ItemRow: React.FC<{
    item: BoardItem;
    index: number;
    total: number;
    preview: string | null;
    disabled: boolean;
    onChange: (patch: Partial<BoardItem>) => void;
    onMove: (delta: number) => void;
    onRemove: () => void;
}> = ({ item, index, total, preview, disabled, onChange, onMove, onRemove }) => {
    const id = `bi-${item.id}`;
    return (
        <li className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-2.5">
            <div className="shrink-0">
                {item.kind === 'image' && item.imagePath ? (
                    <StoredImage kind="board" path={item.imagePath} src={preview} alt="" className="h-14 w-14 rounded-lg" />
                ) : item.kind === 'image' && item.url ? (
                    <img src={item.url} alt="" loading="lazy" className="h-14 w-14 rounded-lg bg-muted object-cover" />
                ) : item.kind === 'color' && item.color ? (
                    <span className="flex h-14 w-14 items-end rounded-lg p-1 text-[9px] font-bold uppercase ring-1 ring-border" style={{ backgroundColor: item.color, color: readableOn(item.color) }}>{item.color.slice(1)}</span>
                ) : (
                    <TypeStamp text={item.kind === 'link' ? 'LINK' : 'NOTE'} className="h-14 w-14" />
                )}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
                <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{itemKindLabel(item.kind)} · {itemHeading(item)}</p>
                <label htmlFor={`${id}-t`} className="sr-only">Title</label>
                <input id={`${id}-t`} className="input h-10 text-sm" value={item.title ?? ''} onChange={e => onChange({ title: e.target.value || null })} maxLength={BOARD_LIMITS.itemTitle} placeholder={item.kind === 'note' ? 'Heading' : 'Title'} disabled={disabled} />
                <label htmlFor={`${id}-c`} className="sr-only">{item.kind === 'note' ? 'Note' : 'Caption'}</label>
                <textarea id={`${id}-c`} className="input min-h-[56px] text-sm" rows={2} value={item.caption ?? ''} onChange={e => onChange({ caption: e.target.value || null })} maxLength={BOARD_LIMITS.caption} placeholder={item.kind === 'note' ? 'The note' : 'Caption'} disabled={disabled} />
                {item.kind === 'color' && (
                    <div className="flex items-center gap-2">
                        <label htmlFor={`${id}-k`} className="sr-only">Colour</label>
                        <input id={`${id}-k`} type="color" className="h-9 w-12 cursor-pointer rounded-md border border-border bg-card p-0.5" value={item.color || '#cccccc'} onChange={e => onChange({ color: e.target.value })} disabled={disabled} />
                        <span className="font-mono text-xs uppercase text-muted-foreground">{item.color}</span>
                    </div>
                )}
                {item.url && <p className="truncate text-xs text-muted-foreground">{item.url}</p>}
            </div>
            <div className="flex shrink-0 flex-col">
                <button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" onClick={() => onMove(-1)} disabled={disabled || index === 0} aria-label={`Move ${itemHeading(item)} up`}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 15 6-6 6 6" /></svg>
                </button>
                <button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" onClick={() => onMove(1)} disabled={disabled || index === total - 1} aria-label={`Move ${itemHeading(item)} down`}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
                </button>
                <button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive" onClick={onRemove} disabled={disabled} aria-label={`Remove ${itemHeading(item)}`}>
                    <TrashIcon className="h-4 w-4" />
                </button>
            </div>
        </li>
    );
};

// ====================================================================================================== the editor
const sameItems = (a: readonly BoardItem[], b: readonly BoardItem[]): boolean => JSON.stringify(a) === JSON.stringify(b);

const BoardEditor: React.FC<{
    board: JobBoard;
    userId: string;
    jobId: string;
    isOnline: boolean;
    paid: boolean;
    hasClient: boolean;
    onBack: () => void;
    onSaved: (board: JobBoard) => void;
    onUpgrade: (reason?: string) => void;
}> = ({ board, userId, jobId, isOnline, paid, hasClient, onBack, onSaved, onUpgrade }) => {
    const [title, setTitle] = useState(board.title);
    const [notes, setNotes] = useState(board.notes ?? '');
    const [items, setItems] = useState<BoardItem[]>(board.items);
    const [view, setView] = useState<'edit' | 'preview'>('edit');
    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [error, setError] = useState('');
    const [askLeave, setAskLeave] = useState(false);
    const session = useRef<Set<string>>(new Set());
    const urls = useRef<string[]>([]);

    // a saved board arrives (after Save, or after sharing): the draft starts again from it. Keyed by what is saved, so a
    // list that is read again with the same content (the connection came back) does not wipe what is being typed.
    const savedKey = JSON.stringify([board.id, board.title, board.notes, board.items]);
    useEffect(() => {
        setTitle(board.title);
        setNotes(board.notes ?? '');
        setItems(board.items);
    }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => () => { urls.current.forEach(u => { try { URL.revokeObjectURL(u); } catch { /* ignore */ } }); }, []);

    const dirty = title !== board.title || notes !== (board.notes ?? '') || !sameItems(items, board.items);
    const busy = saving || sharing || uploading;
    const full = items.length >= BOARD_LIMITS.items;

    // ------------------------------------------------------------------ guards
    const needPremium = (): boolean => { if (paid) return true; onUpgrade(SELECTIONS_PREMIUM_REASON); return false; };
    const needOnline = (): boolean => { if (isOnline) return true; toast.error(NEEDS_CONNECTION); return false; };
    const fail = (e: unknown, fallback: string) => {
        if (isPlanLimitError(e)) onUpgrade(planLimitMessage(e) || SELECTIONS_PREMIUM_REASON);
        else setError(describeError(e, fallback));
    };

    // ------------------------------------------------------------------ items
    const upload = async (file: File) => {
        if (!needPremium() || !needOnline()) return;
        const problem = validateOptionImage({ name: file.name, size: file.size, type: file.type });
        if (problem) { setError(problem); return; }
        setError('');
        setUploading(true);
        try {
            const { imagePath } = await uploadBoardImage(userId, jobId, file);
            session.current.add(imagePath);
            const next = addItem(items, { kind: 'image', imagePath });
            const added = next[next.length - 1];
            try { const u = URL.createObjectURL(file); urls.current.push(u); setPreviews(p => ({ ...p, [added.id]: u })); } catch { /* signed link instead */ }
            setItems(next);
        } catch (e) {
            fail(e, 'The picture could not be added.');
        } finally {
            setUploading(false);
        }
    };

    /** a link, note or colour, or a picture pasted as a link. Returns a readable problem, or null when added. */
    const add = (input: { kind: BoardItemKind; url?: string; title?: string; caption?: string; color?: string }): string | null => {
        if (!needPremium()) return 'Premium is needed to add to a board.';
        try {
            if (input.url) { const v = validateHttpsLink(input.url); if (!v.ok) return v.error; }
            setItems(addItem(items, { kind: input.kind, url: input.url ?? null, title: input.title ?? null, caption: input.caption ?? null, color: input.color ?? null }));
            return null;
        } catch (e) {
            return e instanceof Error ? e.message : 'It could not be added.';
        }
    };

    const patchItem = (id: string, patch: Partial<BoardItem>) => setItems(list => list.map(i => (i.id === id ? { ...i, ...patch } : i)));
    const drop = (id: string) => {
        const it = items.find(i => i.id === id);
        if (it?.imagePath && session.current.has(it.imagePath)) { session.current.delete(it.imagePath); void removeBoardImageFile(it.imagePath); }
        setItems(list => removeItem(list, id));
    };

    // ------------------------------------------------------------------ save / discard / share
    const save = async () => {
        if (busy || !needPremium() || !needOnline()) return;
        setError('');
        setSaving(true);
        try {
            const saved = await updateBoard(board, { title, notes: notes || null, items }, userId);
            session.current.clear();
            onSaved(saved);
            toast.success('Saved.');
        } catch (e) {
            fail(e, 'The changes could not be saved.');
        } finally {
            setSaving(false);
        }
    };

    const discard = () => {
        session.current.forEach(p => { void removeBoardImageFile(p); });
        session.current.clear();
        setTitle(board.title);
        setNotes(board.notes ?? '');
        setItems(board.items);
        setPreviews({});
        setError('');
    };

    const leave = () => { discard(); onBack(); };

    const toggleShare = async (next: boolean) => {
        if (busy || !needPremium() || !needOnline()) return;
        setError('');
        setSharing(true);
        try {
            const saved = await setBoardShared(board, next, userId);
            onSaved(saved);
            toast.success(next ? (hasClient ? 'Shared. Your client sees it on their project link.' : 'Shared. Add a client to this job so they can see it.') : 'Not shared any more. The copies of your pictures made for the client are removed.');
        } catch (e) {
            fail(e, 'The change could not be saved.');
        } finally {
            setSharing(false);
        }
    };

    // ------------------------------------------------------------------ preview
    const paths = useMemo(() => items.filter(i => i.kind === 'image' && i.imagePath && !previews[i.id]).map(i => i.imagePath!), [items, previews]);
    const signed = useSignedUrls('board', paths);
    const galleryItems = useMemo(() => {
        const byId: Record<string, string | null> = {};
        for (const i of items) if (i.kind === 'image') byId[i.id] = previews[i.id] || (i.imagePath ? signed[i.imagePath] ?? null : null);
        return toGalleryItems(items, byId);
    }, [items, previews, signed]);

    return (
        <section aria-labelledby="board-title" className="space-y-4">
            <div>
                <button type="button" onClick={() => (dirty ? setAskLeave(true) : leave())} className="-ml-2 inline-flex h-10 items-center gap-1 rounded-xl px-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
                    <BackArrowIcon className="h-4 w-4" /> All boards
                </button>
                <div className="mt-1 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <label htmlFor="board-title" className="sr-only">Board name</label>
                        <input id="board-title" className="input h-12 text-lg font-bold" value={title} onChange={e => setTitle(e.target.value)} maxLength={BOARD_LIMITS.title} placeholder="Board name, e.g. Kitchen ideas" disabled={saving} />
                        <p className="mt-1 text-xs text-muted-foreground">{boardSummary({ items })}</p>
                    </div>
                    <HelpButton topic="job-boards" />
                </div>
            </div>

            {/* sharing */}
            <div className="rounded-xl border border-border bg-card p-3.5">
                <SwitchRow
                    checked={board.sharedInPortal}
                    onChange={next => { void toggleShare(next); }}
                    label="Share with client"
                    hint={board.sharedInPortal ? BOARD_SHARED_NOTE : BOARD_PRIVATE_NOTE}
                    disabled={dirty}
                    busy={sharing}
                />
                <p className="mt-2 border-t border-border/70 pt-2 text-xs text-muted-foreground">{BOARD_SHARE_NOTE}{dirty ? ' Save your changes to change sharing.' : ''}</p>
                {board.sharedInPortal && !hasClient && <p className="mt-1.5 text-xs font-medium text-foreground">Add a client to this job so they can see it.</p>}
            </div>

            <Segmented<'edit' | 'preview'>
                ariaLabel="Edit or preview"
                value={view}
                onChange={setView}
                options={[{ value: 'edit', label: 'Edit' }, { value: 'preview', label: 'Client preview' }]}
            />

            {view === 'edit' ? (
                <div className="space-y-4">
                    <ItemAdder disabled={busy} uploading={uploading} full={full} onUpload={f => { void upload(f); }} onAdd={add} />

                    {items.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Nothing on this board yet. Add a picture, a link, a note or a colour above.</p>
                    ) : (
                        <ul className="space-y-2" aria-label="Items on the board">
                            {items.map((it, i) => (
                                <ItemRow key={it.id} item={it} index={i} total={items.length} preview={previews[it.id] ?? null} disabled={saving}
                                    onChange={patch => patchItem(it.id, patch)} onMove={d => setItems(list => moveItem(list, it.id, d))} onRemove={() => drop(it.id)} />
                            ))}
                        </ul>
                    )}

                    <Field label="Your notes (private)" htmlFor="board-notes" hint="Only you see these. They are never shown to your client, even when the board is shared.">
                        <textarea id="board-notes" className="input min-h-[88px]" rows={3} value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} disabled={saving} />
                    </Field>
                </div>
            ) : (
                <div>
                    <p className="mb-2 text-xs text-muted-foreground">
                        {board.sharedInPortal ? 'This is what your client sees' : 'This is what your client will see once you share it'}{dirty ? ', including the changes you have not saved yet' : ''}. Your private notes are not part of it.
                    </p>
                    <div className="rounded-2xl border border-border bg-background p-3.5 sm:p-5">
                        <h3 className="mb-3 text-base font-bold">{title || 'Untitled board'}</h3>
                        <BoardGallery items={galleryItems} emptyText="Nothing on this board yet." />
                    </div>
                </div>
            )}

            {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
            {!isOnline && <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm" role="status">{NEEDS_CONNECTION}</p>}

            {dirty && (
                <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-2 border-t border-border bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:mx-0 sm:rounded-xl sm:border" role="region" aria-label="Unsaved changes">
                    <p className="text-sm font-medium">Unsaved changes</p>
                    <div className="flex gap-2">
                        <button type="button" className="btn btn-outline h-10" onClick={discard} disabled={busy}>Discard</button>
                        <button type="button" className="btn btn-primary h-10" onClick={() => { void save(); }} disabled={busy}>{saving ? 'Saving…' : 'Save changes'}</button>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={askLeave}
                title="Leave without saving?"
                message="Your changes to this board are not saved. Pictures you added are removed again."
                confirmLabel="Leave"
                destructive
                onConfirm={() => { setAskLeave(false); leave(); }}
                onCancel={() => setAskLeave(false)}
            />
        </section>
    );
};

export default BoardEditor;
