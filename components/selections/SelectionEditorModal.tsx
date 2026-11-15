/**
 * Job page › Selections: write a selection (new, or an existing draft / one already sent / one that needs changes).
 *  - start from one of the six ready-made ones (Tile, Paint colour, Flooring, Fixtures, Appliances, Countertops), or blank
 *  - title, room, category, a message, a date to choose by, and the allowance the contract includes
 *  - 1 to 6 options: photo (uploaded, shown here at once), name, description, product link (https), SKU, supplier, unit,
 *    quantity, price to the client and YOUR cost. The cost is private: it never reaches the client (labelled "only you see this").
 *    Each option shows its total and the upgrade / credit against the allowance as you type.
 *  - "Save draft" keeps it to yourself; "Send to client" puts it on their project link (the photos are copied to the
 *    client's side then). Changing a sent selection shows the client the new options at once.
 * The options are locked while the client's choice stands (the detail window explains how to open them up again).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { describeError, planLimitMessage } from '../../lib/account.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { isPlanLimitError } from '../../lib/jobFiles/jobFilesApi.ts';
import { addDays, todayYmd } from '../../lib/tasks/taskLogic.ts';
import { SELECTION_TEMPLATES, draftFromTemplate, validateDraft, validateHttpsLink, validateOptionImage } from '../../lib/selections/selectionLogic.ts';
import {
    createSelection, removeOptionImageFile, sendSelection, shareOptionImages, updateSelection, uploadOptionImage,
} from '../../lib/selections/selectionsApi.ts';
import { SELECTION_LIMITS, type JobSelection } from '../../lib/selections/selectionTypes.ts';
import {
    COST_PRIVATE, SELECTIONS_PREMIUM_REASON, canAddOption, clientLinkNote, differenceText, differenceTone, draftFromRows, emptyOption,
    moneyText, optionRowFromOption, optionTotalsLine, rowPricing, type OptionRow,
} from '../../lib/selections/selectionView.ts';
import type { SupplierRecord } from '../../lib/suppliers/types.ts';
import { cx } from '../commsKit.tsx';
import { Field, Modal } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { LockIcon, PlusIcon, TrashIcon, UploadImageIcon } from '../Icons.tsx';
import StoredImage from './StoredImage.tsx';

type Mode = 'new' | 'draft' | 'changes' | 'sent';

const modeOf = (s?: JobSelection): Mode => (!s ? 'new' : s.status === 'sent' ? 'sent' : s.status === 'changes_requested' ? 'changes' : 'draft');

// ====================================================================================================== one option
const OptionBlock: React.FC<{
    index: number;
    row: OptionRow;
    allowance: string;
    suppliers: readonly SupplierRecord[] | null;
    preview: string | null;
    busy: boolean;
    uploading: boolean;
    canRemove: boolean;
    onChange: (patch: Partial<OptionRow>) => void;
    onPickImage: (file: File) => void;
    onRemoveImage: () => void;
    onRemove: () => void;
}> = ({ index, row, allowance, suppliers, preview, busy, uploading, canRemove, onChange, onPickImage, onRemoveImage, onRemove }) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const { qty, unitPrice, pricing } = rowPricing(row, allowance);
    const [more, setMore] = useState(!!(row.url || row.sku || row.supplierId));
    const linkProblem = row.url.trim() ? validateHttpsLink(row.url) : null;
    const diff = differenceText(pricing.difference);
    const tone = differenceTone(pricing.difference);
    const priced = row.unitPrice.trim() !== '';
    const profit = pricing.cost !== null && priced ? pricing.total - pricing.cost : null;
    const id = `opt-${row.id}`;
    return (
        <li className="relative rounded-xl border border-border bg-card p-3 sm:p-3.5" aria-label={`Option ${index + 1}`}>
            <div className="flex items-start gap-3">
                {/* the photo: tap to add or change */}
                <div className="shrink-0">
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={busy || uploading}
                        className="group relative block h-[84px] w-[84px] overflow-hidden rounded-lg border border-dashed border-border bg-muted/50 text-muted-foreground transition hover:border-primary/60"
                        aria-label={row.imagePath ? `Change the photo of option ${index + 1}` : `Add a photo to option ${index + 1}`}
                    >
                        {row.imagePath ? (
                            <StoredImage path={row.imagePath} src={preview} alt="" className="h-full w-full" />
                        ) : (
                            <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold">
                                <UploadImageIcon className="h-5 w-5" />
                                {uploading ? 'Adding…' : 'Add photo'}
                            </span>
                        )}
                        {uploading && row.imagePath && <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-[11px] font-semibold">Adding…</span>}
                    </button>
                    {row.imagePath && (
                        <button type="button" className="mt-1 h-8 w-full text-[11px] font-semibold text-muted-foreground hover:text-destructive" onClick={onRemoveImage} disabled={busy || uploading}>Remove photo</button>
                    )}
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        tabIndex={-1}
                        aria-hidden
                        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPickImage(f); }}
                    />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-start gap-1.5">
                        <div className="min-w-0 flex-1">
                            <label htmlFor={`${id}-name`} className="sr-only">Name of option {index + 1}</label>
                            <input id={`${id}-name`} className="input h-11 font-semibold" value={row.name} onChange={e => onChange({ name: e.target.value })} maxLength={SELECTION_LIMITS.optionName} placeholder={`Option ${index + 1} name, e.g. Matte white 3x6`} disabled={busy} />
                        </div>
                        {canRemove && (
                            <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive" onClick={onRemove} disabled={busy} aria-label={`Remove option ${index + 1}`}>
                                <TrashIcon className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    <label htmlFor={`${id}-desc`} className="sr-only">Description of option {index + 1}</label>
                    <textarea id={`${id}-desc`} className="input min-h-[64px]" rows={2} value={row.description} onChange={e => onChange({ description: e.target.value })} maxLength={SELECTION_LIMITS.optionDescription} placeholder="What the client should know: size, finish, brand" disabled={busy} />
                </div>
            </div>

            {/* the money: a ruled row, the cost set apart */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                    <label htmlFor={`${id}-qty`} className="label">Quantity</label>
                    <input id={`${id}-qty`} className="input h-11" inputMode="decimal" value={row.qty} onChange={e => onChange({ qty: e.target.value })} onFocus={e => e.currentTarget.select()} disabled={busy} />
                </div>
                <div>
                    <label htmlFor={`${id}-unit`} className="label">Unit</label>
                    <input id={`${id}-unit`} className="input h-11" value={row.unit} onChange={e => onChange({ unit: e.target.value })} maxLength={SELECTION_LIMITS.unit} placeholder="sq ft, each" disabled={busy} />
                </div>
                <div>
                    <label htmlFor={`${id}-price`} className="label">Price to client (each)</label>
                    <input id={`${id}-price`} className="input h-11" inputMode="decimal" value={row.unitPrice} onChange={e => onChange({ unitPrice: e.target.value })} placeholder="0.00" disabled={busy} />
                </div>
                <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2 pb-1.5 pt-1">
                    <label htmlFor={`${id}-cost`} className="flex items-center gap-1 text-xs font-semibold text-foreground"><LockIcon className="h-3 w-3 text-primary" /> Your cost (each)</label>
                    <input id={`${id}-cost`} className="input mt-0.5 h-9 bg-background" inputMode="decimal" value={row.unitCost} onChange={e => onChange({ unitCost: e.target.value })} placeholder="0.00" disabled={busy} />
                    <p className="mt-0.5 text-[11px] font-medium text-primary">{COST_PRIVATE}</p>
                </div>
            </div>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm tabular-nums" aria-live="polite">
                <span className="font-semibold">{priced ? optionTotalsLine(qty, unitPrice, pricing, row.unit.trim() || null) : 'Enter the price to see the total'}</span>
                {priced && diff && <span className={cx('text-xs font-bold', tone === 'up' && 'text-foreground', tone === 'down' && 'text-success', tone === 'same' && 'text-muted-foreground')}>{diff}</span>}
                {profit !== null && <span className="text-xs text-muted-foreground">Your margin {moneyText(profit)}{pricing.total > 0 ? ` (${Math.round((profit / pricing.total) * 100)}%)` : ''}</span>}
            </p>

            <button type="button" className="mt-2 h-9 text-sm font-semibold text-primary" onClick={() => setMore(v => !v)} aria-expanded={more}>
                {more ? 'Hide product details' : 'Product link, SKU, supplier'}
            </button>
            {more && (
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                        <label htmlFor={`${id}-url`} className="label">Product link</label>
                        <input id={`${id}-url`} className="input h-11" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={row.url} onChange={e => onChange({ url: e.target.value })} placeholder="https://…" disabled={busy} aria-invalid={linkProblem ? !linkProblem.ok : undefined} />
                        {linkProblem && !linkProblem.ok && <p className="mt-1 text-xs font-medium text-destructive">{linkProblem.error}</p>}
                        {!row.url.trim() && <p className="mt-1 text-xs text-muted-foreground">The client can open it. Links must start with https://</p>}
                    </div>
                    <div>
                        <label htmlFor={`${id}-sku`} className="label">SKU / model <span className="font-normal text-muted-foreground">({COST_PRIVATE})</span></label>
                        <input id={`${id}-sku`} className="input h-11" value={row.sku} onChange={e => onChange({ sku: e.target.value })} maxLength={SELECTION_LIMITS.sku} disabled={busy} />
                    </div>
                    {suppliers && suppliers.length > 0 && (
                        <div>
                            <label htmlFor={`${id}-sup`} className="label">Supplier <span className="font-normal text-muted-foreground">({COST_PRIVATE})</span></label>
                            <select id={`${id}-sup`} className="input h-11" value={row.supplierId} onChange={e => onChange({ supplierId: e.target.value })} disabled={busy}>
                                <option value="">No supplier chosen</option>
                                {row.supplierId && !suppliers.some(s => s.id === row.supplierId) && <option value={row.supplierId}>(supplier no longer in your list)</option>}
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    )}
                </div>
            )}
        </li>
    );
};

// ====================================================================================================== the window
const SelectionEditorModal: React.FC<{
    /** the selection being changed; omitted = a new one */
    selection?: JobSelection;
    userId: string;
    jobId: string;
    isOnline: boolean;
    hasClient: boolean;
    /** saved suppliers for the supplier picker (null = the suppliers list is not in the database: no picker) */
    suppliers: readonly SupplierRecord[] | null;
    onClose: () => void;
    onSaved: (saved: JobSelection, sent: boolean) => void;
    onUpgrade: (reason?: string) => void;
}> = ({ selection, userId, jobId, isOnline, hasClient, suppliers, onClose, onSaved, onUpgrade }) => {
    const mode = modeOf(selection);
    const [title, setTitle] = useState(selection?.title ?? '');
    const [room, setRoom] = useState(selection?.room ?? '');
    const [category, setCategory] = useState(selection?.category ?? '');
    const [body, setBody] = useState(selection?.body ?? '');
    const [due, setDue] = useState(selection?.dueDate ?? '');
    const [allowance, setAllowance] = useState(selection?.allowance !== null && selection?.allowance !== undefined ? String(selection.allowance) : '');
    const [rows, setRows] = useState<OptionRow[]>(() => (selection && selection.options.length ? selection.options.map(optionRowFromOption) : [emptyOption(), emptyOption()]));
    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [uploading, setUploading] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState<'draft' | 'send' | null>(null);
    /** images uploaded in this window and not saved yet: removed again when the window is closed without saving */
    const session = useRef<Set<string>>(new Set());
    const previewUrls = useRef<string[]>([]);
    const today = todayYmd();

    useEffect(() => () => { previewUrls.current.forEach(u => { try { URL.revokeObjectURL(u); } catch { /* ignore */ } }); }, []);

    const setRow = (id: string, patch: Partial<OptionRow>) => setRows(list => list.map(r => (r.id === id ? { ...r, ...patch } : r)));

    const dropUploaded = (path: string | null) => {
        if (path && session.current.has(path)) { session.current.delete(path); void removeOptionImageFile(path); }
    };

    const applyTemplate = (id: string) => {
        const d = draftFromTemplate(id);
        rows.forEach(r => dropUploaded(r.imagePath));
        setPreviews({});
        setTitle(d.title);
        setCategory(d.category ?? '');
        setBody(d.body ?? '');
        setRows((d.options || []).map(optionRowFromOption));
        setError('');
    };

    const pickImage = async (rowId: string, file: File) => {
        if (!isOnline) { toast.error(NEEDS_CONNECTION); return; }
        const problem = validateOptionImage({ name: file.name, size: file.size, type: file.type });
        if (problem) { setError(problem); return; }
        setError('');
        setUploading(rowId);
        try {
            const { imagePath } = await uploadOptionImage(userId, jobId, file);
            session.current.add(imagePath);
            const before = rows.find(r => r.id === rowId)?.imagePath ?? null;
            dropUploaded(before);
            let url = '';
            try { url = URL.createObjectURL(file); previewUrls.current.push(url); } catch { /* the signed link is used instead */ }
            if (url) setPreviews(p => ({ ...p, [rowId]: url }));
            // a new picture needs its own copy for the client: the old copy must not stay linked
            setRow(rowId, { imagePath, portalPath: null });
        } catch (e) {
            setError(describeError(e, 'The image could not be added.'));
        } finally {
            setUploading(null);
        }
    };

    const removeImage = (rowId: string) => {
        const row = rows.find(r => r.id === rowId);
        if (!row) return;
        dropUploaded(row.imagePath);
        setPreviews(p => { const n = { ...p }; delete n[rowId]; return n; });
        setRow(rowId, { imagePath: null, portalPath: null });
    };

    const removeRow = (rowId: string) => {
        const row = rows.find(r => r.id === rowId);
        if (row) dropUploaded(row.imagePath);
        setRows(list => (list.length > 1 ? list.filter(r => r.id !== rowId) : list));
    };

    const closeWindow = () => {
        if (busy) return;
        session.current.forEach(p => { void removeOptionImageFile(p); });
        session.current.clear();
        onClose();
    };

    const draft = useMemo(() => draftFromRows({ title, category, room, body, dueDate: due, allowance, rows }), [title, category, room, body, due, allowance, rows]);

    const save = async (send: boolean) => {
        if (busy || uploading) return;
        if (!isOnline) { toast.error(NEEDS_CONNECTION); return; }
        const problem = validateDraft(draft, { sending: send });
        if (problem) { setError(problem); return; }
        setError('');
        setBusy(send ? 'send' : 'draft');
        let saved: JobSelection | null = null;
        try {
            if (!selection) saved = await createSelection(userId, jobId, draft);
            else saved = await updateSelection(selection, draft);
            session.current.clear();
        } catch (e) {
            if (isPlanLimitError(e)) onUpgrade(planLimitMessage(e) || SELECTIONS_PREMIUM_REASON);
            else setError(describeError(e, 'It could not be saved.'));
            setBusy(null);
            return;
        }
        try {
            if (send) saved = await sendSelection(saved, userId);
            else if (saved.status === 'sent') saved = await shareOptionImages(saved, userId);
            onSaved(saved, send || saved.status === 'sent');
            onClose();
        } catch (e) {
            // it is saved; only the sending (or the copy of the photos for the client) failed
            onSaved(saved, false);
            toast.error(`Saved, but the client cannot see it yet: ${describeError(e, 'it could not be sent.')} Open it and send it again.`);
            onClose();
        } finally {
            setBusy(null);
        }
    };

    const titleText = mode === 'new' ? 'New selection for your client' : mode === 'sent' ? 'Change what the client sees' : mode === 'changes' ? 'Update the options' : 'Edit the draft';
    const working = busy !== null || uploading !== null;

    return (
        <Modal
            open
            onClose={closeWindow}
            busy={busy !== null}
            size="lg"
            title={titleText}
            footer={(
                // phone: the main button across the full width, Cancel and Save side by side (three stacked buttons hide the form)
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:justify-end">
                    {mode === 'sent' ? (
                        <button type="button" className="btn btn-primary order-first col-span-2 sm:order-3 sm:col-span-1" onClick={() => { void save(false); }} disabled={working}>{busy === 'draft' ? 'Saving…' : 'Save changes'}</button>
                    ) : (
                        <button type="button" className="btn btn-primary order-first col-span-2 sm:order-3 sm:col-span-1" onClick={() => { void save(true); }} disabled={working}>{busy === 'send' ? 'Sending…' : mode === 'changes' ? 'Send again' : 'Send to client'}</button>
                    )}
                    <button type="button" className="btn btn-outline sm:order-1" onClick={closeWindow} disabled={busy !== null}>Cancel</button>
                    {mode !== 'sent' && (
                        <button type="button" className="btn btn-outline sm:order-2" onClick={() => { void save(false); }} disabled={working}>{busy === 'draft' ? 'Saving…' : mode === 'changes' ? 'Save changes' : 'Save draft'}</button>
                    )}
                </div>
            )}
        >
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(false); }}>
                {mode === 'new' && (
                    <div>
                        <p className="label">Start from</p>
                        <div className="-mx-1 flex flex-wrap gap-2 px-1">
                            {SELECTION_TEMPLATES.map(t => (
                                <button key={t.id} type="button" onClick={() => applyTemplate(t.id)} disabled={working}
                                    className="min-h-[36px] rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:border-primary/50">
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <Field label="Title" htmlFor="sel-title">
                    <input id="sel-title" className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={SELECTION_LIMITS.title} placeholder="e.g. Choose your bathroom tile" disabled={busy !== null} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Room (optional)" htmlFor="sel-room">
                        <input id="sel-room" className="input" value={room} onChange={e => setRoom(e.target.value)} maxLength={SELECTION_LIMITS.room} placeholder="e.g. Master bath" disabled={busy !== null} />
                    </Field>
                    <Field label="Category (optional)" htmlFor="sel-cat">
                        <input id="sel-cat" className="input" list="sel-cats" value={category} onChange={e => setCategory(e.target.value)} maxLength={SELECTION_LIMITS.category} placeholder="tile, paint, flooring…" disabled={busy !== null} />
                        <datalist id="sel-cats">{SELECTION_TEMPLATES.map(t => <option key={t.id} value={t.id} />)}</datalist>
                    </Field>
                </div>
                <Field label="Message (optional)" htmlFor="sel-body" hint="What the client should know before they choose, in plain words.">
                    <textarea id="sel-body" className="input min-h-[88px]" rows={3} value={body} onChange={e => setBody(e.target.value)} maxLength={SELECTION_LIMITS.body} disabled={busy !== null} />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Choose by (optional)" htmlFor="sel-due">
                        <div className="flex flex-wrap items-center gap-2">
                            <input id="sel-due" type="date" className="input h-11 w-auto" value={due} onChange={e => setDue(e.target.value)} min={mode === 'new' ? today : undefined} disabled={busy !== null} />
                            <button type="button" className="h-10 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground" onClick={() => setDue(addDays(today, 3))}>In 3 days</button>
                            <button type="button" className="h-10 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground" onClick={() => setDue(addDays(today, 7))}>In a week</button>
                            {due && <button type="button" className="h-10 px-2 text-xs font-semibold text-muted-foreground" onClick={() => setDue('')}>Clear</button>}
                        </div>
                    </Field>
                    <Field label="Allowance in the contract (optional)" htmlFor="sel-allow" hint="What the price already includes. An option above it is an upgrade for the client, below it a credit.">
                        <input id="sel-allow" className="input" inputMode="decimal" value={allowance} onChange={e => setAllowance(e.target.value)} placeholder="e.g. 1,000" disabled={busy !== null} />
                    </Field>
                </div>

                {/* the options */}
                <div>
                    <div className="flex items-center justify-between gap-3">
                        <p className="label !mb-0">Options <span className="font-normal text-muted-foreground">({rows.length} of {SELECTION_LIMITS.options})</span></p>
                        <button type="button" className="inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-primary disabled:text-muted-foreground" onClick={() => setRows(list => [...list, emptyOption()])} disabled={!canAddOption(rows) || working}>
                            <PlusIcon className="h-4 w-4" /> Add option
                        </button>
                    </div>
                    <ul className="mt-2 space-y-3">
                        {rows.map((r, i) => (
                            <OptionBlock
                                key={r.id}
                                index={i}
                                row={r}
                                allowance={allowance}
                                suppliers={suppliers}
                                preview={previews[r.id] ?? null}
                                busy={busy !== null}
                                uploading={uploading === r.id}
                                canRemove={rows.length > 1}
                                onChange={patch => setRow(r.id, patch)}
                                onPickImage={f => { void pickImage(r.id, f); }}
                                onRemoveImage={() => removeImage(r.id)}
                                onRemove={() => removeRow(r.id)}
                            />
                        ))}
                    </ul>
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"><LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Your cost, SKU and supplier are never shown to your client. They see the photo, name, description, link, quantity and price.</p>
                </div>

                {mode === 'sent' && <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-foreground">This is already with your client. They see your changes at once, and the history says it was changed.</p>}
                <p className={cx('rounded-lg px-3 py-2 text-xs', hasClient ? 'bg-muted/60 text-muted-foreground' : 'bg-warning/10 text-foreground')}>{clientLinkNote(hasClient)}</p>
                {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
            </form>
        </Modal>
    );
};

export default SelectionEditorModal;
