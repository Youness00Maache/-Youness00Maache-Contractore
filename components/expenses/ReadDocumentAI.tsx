/**
 * "Read with AI" in the Expense Log (roadmap N6, Premium + AI): photos (up to 4) or one PDF of a receipt, supplier
 * invoice, quote or delivery note -> the ai-assistant task 'read_document' (src/ai/readDocument.ts) -> a REVIEW screen
 * where every value can be changed -> Save writes ONE expense through the Expense Log's own save (onSave below calls
 * the form's update + save; no new write path). Nothing is saved before the user presses Save.
 *
 * Plans: Premium + AI sees the button (online only); Free and Premium see one quiet upgrade line. Offline nothing
 * renders here: the Tesseract "Scan receipt" next to it keeps working exactly as before.
 * Design (owner rule: compact, no icon-card grids): the original on the left like a paper on the desk, the reading on
 * the right as a ledger; checks the AI is unsure about carry an amber underline and a "check" tag.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { designPlan } from '../../lib/designPlan.ts';
import { dispatchUpgradeEvent, isAiLimitCode } from '../../src/ai/events.ts';
import {
    prepareDocumentFiles, ReadDocumentError, releasePreparedFiles, runReadDocument, type PreparedDocFile,
} from '../../src/ai/readDocument.ts';
import {
    draftFromReading, fieldConfidence, KIND_LABELS, lineAmount, newLineKey, reviewProblem, suggestJob, toExpensePatch, totalsCheck,
    type ExpensePatchResult, type JobRef, type ReviewDraft, type ReviewField, type ReviewLine,
} from '../../src/ai/readDocumentReview.ts';
import {
    DOCUMENT_KINDS, hasUsableReading, parseMoneyValue, READ_DOCUMENT_TIER, READ_DOCUMENT_UPGRADE_MESSAGE, type DocumentKind,
} from '../../supabase/functions/ai-assistant/shared/documentReading.ts';
import { todayYMD } from '../../utils/localDates.ts';
import { Modal } from '../viewKit.tsx';
import { Spinner } from '../forms/FormShell.tsx';

export interface ReadDocumentAIProps {
    categories: readonly string[];
    isOnline: boolean;
    job: { id: string; name: string };
    /** the account's jobs (a job the document mentions is suggested, never assigned) */
    jobs?: readonly JobRef[];
    /** current notes / title of the expense (kept; the reading is added below the notes) */
    getCurrent: () => { notes?: string; title?: string };
    /** existing document-image upload (used only when the user ticks "Keep the photo") */
    onUploadImage?: (file: File) => Promise<string>;
    /** applies the patch to the form and runs the form's normal save; true when saved */
    onSave: (result: ExpensePatchResult) => Promise<boolean>;
}

type State =
    | { status: 'idle' }
    | { status: 'reading' }
    | { status: 'error'; message: string; upgrade: boolean }
    | { status: 'review'; files: PreparedDocFile[]; draft: ReviewDraft };

/** Amount box that may be empty (null = not on the document). */
const AmountInput: React.FC<{ value: number | null; onChange: (v: number | null) => void; label: string; flag?: 'low' | 'medium'; className?: string; allowNegative?: boolean }> = ({ value, onChange, label, flag, className = '', allowNegative }) => {
    const [text, setText] = useState(value === null ? '' : value.toFixed(2));
    const last = useRef(value);
    useEffect(() => {
        if (value !== last.current) { last.current = value; setText(value === null ? '' : value.toFixed(2)); }
    }, [value]);
    return (
        <input
            aria-label={label}
            inputMode="decimal"
            className={`input h-9 text-right tabular-nums ${flag ? 'border-warning' : ''} ${className}`}
            value={text}
            placeholder="—"
            onChange={e => {
                setText(e.target.value);
                let n = parseMoneyValue(e.target.value);
                if (n !== null && n < 0 && !allowNegative) n = Math.abs(n);
                last.current = n;
                onChange(n);
            }}
            onBlur={() => setText(last.current === null ? '' : last.current.toFixed(2))}
        />
    );
};

const CheckTag: React.FC<{ level?: 'low' | 'medium' }> = ({ level }) => (level
    ? <span className={`ml-1.5 rounded px-1 text-[10px] font-semibold uppercase tracking-wide ${level === 'low' ? 'bg-warning/15 text-warning' : 'text-muted-foreground'}`}>{level === 'low' ? 'check' : 'unsure'}</span>
    : null);

const Label: React.FC<{ children: React.ReactNode; flag?: 'low' | 'medium'; htmlFor?: string }> = ({ children, flag, htmlFor }) => (
    <label htmlFor={htmlFor} className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{children}<CheckTag level={flag} /></label>
);

export const ReadDocumentAI: React.FC<ReadDocumentAIProps> = ({ categories, isOnline, job, jobs = [], getCurrent, onUploadImage, onSave }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const [state, setState] = useState<State>({ status: 'idle' });
    const allowed = designPlan() === READ_DOCUMENT_TIER;

    useEffect(() => () => abortRef.current?.abort(), []);
    useEffect(() => () => { if (state.status === 'review') releasePreparedFiles(state.files); }, [state]);

    const read = async (list: FileList | null) => {
        const picked = Array.from(list || []);
        if (inputRef.current) inputRef.current.value = '';
        if (!picked.length) return;
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setState({ status: 'reading' });
        let files: PreparedDocFile[] = [];
        try {
            files = await prepareDocumentFiles(picked);
            const result = await runReadDocument({
                files, categories, today: todayYMD(),
                language: typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2) : undefined,
            }, ctrl.signal);
            if (ctrl.signal.aborted) { releasePreparedFiles(files); return; }
            if (!hasUsableReading(result)) {
                releasePreparedFiles(files);
                const why = result.warnings.map(w => w.message).filter(Boolean).slice(0, 2).join(' ');
                setState({ status: 'error', upgrade: false, message: `Nothing could be read from that.${why ? ` ${why}` : ''} Try a sharper, well-lit photo, or use Scan receipt.` });
                return;
            }
            setState({ status: 'review', files, draft: draftFromReading(result, categories) });
        } catch (e) {
            releasePreparedFiles(files);
            if (ctrl.signal.aborted) return;
            const code = e instanceof ReadDocumentError ? e.code : '';
            const message = e instanceof Error ? e.message : '';
            const upgrade = code === 'PLAN_REQUIRED' || isAiLimitCode(code);
            if (upgrade) dispatchUpgradeEvent(message || READ_DOCUMENT_UPGRADE_MESSAGE);
            setState({ status: 'error', upgrade, message: message || 'The AI could not read it right now. Please try again.' });
        } finally {
            if (abortRef.current === ctrl) abortRef.current = null;
        }
    };

    if (!allowed) {
        return (
            <p className="text-xs text-muted-foreground">
                Read receipts, supplier invoices and PDFs with AI, then check and save: Premium + AI.{' '}
                <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => dispatchUpgradeEvent(READ_DOCUMENT_UPGRADE_MESSAGE)}>Upgrade</button>
            </p>
        );
    }
    if (!isOnline && state.status !== 'review') return null;

    return (
        <div className="space-y-2">
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/*,application/pdf,.pdf" multiple className="hidden" onChange={e => void read(e.target.files)} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <button type="button" className="btn btn-outline min-h-[40px]" onClick={() => inputRef.current?.click()} disabled={state.status === 'reading'} aria-busy={state.status === 'reading'}>
                    {state.status === 'reading' ? <><Spinner /> Reading with AI…</> : 'Read with AI'}
                </button>
                <span className="text-[11px] text-muted-foreground">
                    {state.status === 'reading' ? 'Usually 10 to 30 seconds.' : 'Receipt, supplier invoice or PDF (up to 4 photos or one PDF). You check everything before it saves. 1 AI request.'}
                </span>
            </div>
            {state.status === 'error' && (
                <p role="alert" className={`border-l-2 pl-3 text-sm ${state.upgrade ? 'border-primary/60 text-foreground' : 'border-destructive text-destructive'}`}>{state.message}</p>
            )}
            {state.status === 'review' && (
                <ReviewModal
                    files={state.files}
                    initial={state.draft}
                    categories={categories}
                    job={job}
                    jobs={jobs}
                    canKeepPhoto={Boolean(onUploadImage) && state.files.some(f => f.kind === 'image')}
                    onCancel={() => setState({ status: 'idle' })}
                    onSave={async (draft, keepPhoto) => {
                        let photoUrl: string | undefined;
                        if (keepPhoto && onUploadImage) {
                            const img = state.files.find(f => f.kind === 'image');
                            if (img) photoUrl = (await onUploadImage(img.file).catch(() => '')) || undefined;
                        }
                        const current = getCurrent();
                        const ok = await onSave(toExpensePatch(draft, { existingNotes: current.notes, existingTitle: current.title, photoUrl }));
                        if (ok) setState({ status: 'idle' });
                        return ok;
                    }}
                />
            )}
        </div>
    );
};

/** The review screen (exported for the local harness / tests). */
export const ReviewModal: React.FC<{
    files: PreparedDocFile[];
    initial: ReviewDraft;
    categories: readonly string[];
    job: { id: string; name: string };
    jobs: readonly JobRef[];
    canKeepPhoto: boolean;
    onCancel: () => void;
    onSave: (draft: ReviewDraft, keepPhoto: boolean) => Promise<boolean>;
}> = ({ files, initial, categories, job, jobs, canKeepPhoto, onCancel, onSave }) => {
    const [d, setD] = useState<ReviewDraft>(initial);
    const [page, setPage] = useState(0);
    const [saving, setSaving] = useState(false);
    const [keepPhoto, setKeepPhoto] = useState(false);
    const set = (patch: Partial<ReviewDraft>) => setD(prev => ({ ...prev, ...patch }));
    const setLine = (key: string, patch: Partial<ReviewLine>) => setD(prev => ({ ...prev, lines: prev.lines.map(l => (l.key === key ? { ...l, ...patch } : l)) }));
    const flags = useMemo(() => fieldConfidence(d.confidence), [d.confidence]);
    const check = totalsCheck(d);
    const problem = reviewProblem(d);
    const suggestion = useMemo(() => suggestJob(d, jobs, job.id), [d, jobs, job.id]);
    const file = files[Math.min(page, files.length - 1)];
    const pdf = files.find(f => f.kind === 'pdf');
    const flag = (f: ReviewField) => flags[f];
    const neg = d.isCreditNote;

    const save = async () => {
        if (problem || saving) return;
        setSaving(true);
        try { await onSave(d, keepPhoto); } finally { setSaving(false); }
    };

    return (
        <Modal
            open
            size="xl"
            busy={saving}
            onClose={onCancel}
            title={`Check the ${KIND_LABELS[d.kind].toLowerCase()}`}
            description="Read by AI. Change anything that is wrong, then save it as an expense on this job."
            bodyClassName="p-0"
            footer={(
                <div className="flex w-full flex-wrap items-center justify-end gap-2">
                    {problem && <span className="mr-auto text-xs text-warning">{problem}</span>}
                    <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={Boolean(problem) || saving}>
                        {saving ? <><Spinner /> Saving…</> : 'Save expense'}
                    </button>
                </div>
            )}
        >
            <div className="grid gap-0 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                {/* the original, like the paper on the desk */}
                <section aria-label="Original" className="border-b border-border bg-muted/40 p-3 md:border-b-0 md:border-r md:p-4">
                    {file?.kind === 'image' && (
                        <img src={file.previewUrl} alt={`Page ${page + 1} of what you read`} className="mx-auto max-h-[38vh] w-auto rounded-sm bg-white object-contain shadow-sm md:max-h-[64vh]" />
                    )}
                    {file?.kind === 'pdf' && (
                        <>
                            <iframe src={file.previewUrl} title="The PDF you read" className="hidden h-[60vh] w-full rounded-sm bg-white md:block" />
                            <a href={file.previewUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary underline-offset-2 hover:underline md:hidden">Open the PDF ({file.name})</a>
                        </>
                    )}
                    {files.length > 1 && (
                        <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Pages">
                            {files.map((f, i) => (
                                <button key={f.previewUrl} type="button" role="tab" aria-selected={i === page} onClick={() => setPage(i)}
                                    className={`rounded px-2 py-0.5 text-xs font-semibold ${i === page ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}>
                                    {f.kind === 'pdf' ? 'PDF' : `Photo ${i + 1}`}
                                </button>
                            ))}
                        </div>
                    )}
                    {d.summary && (
                        <div className="mt-3 border-l-2 border-primary/60 pl-3">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">AI summary{pdf && d.pageCount && d.pageCount > 1 ? ` · ${d.pageCount} pages` : ''}</span>
                            <p className="mt-0.5 text-sm leading-snug text-foreground">{d.summary}</p>
                        </div>
                    )}
                    {canKeepPhoto && (
                        <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                            <input type="checkbox" className="mt-0.5" checked={keepPhoto} onChange={e => setKeepPhoto(e.target.checked)} />
                            <span>Keep a copy of the photo with this expense (a link is added to the notes).</span>
                        </label>
                    )}
                </section>

                {/* the reading, as a ledger */}
                <section aria-label="What the AI read" className="space-y-4 p-3 md:p-4">
                    {d.warnings.length > 0 && (
                        <ul className="space-y-1 border-l-2 border-warning pl-3 text-sm text-foreground" aria-label="Warnings">
                            {d.warnings.map(w => <li key={w.code}>{w.message}</li>)}
                        </ul>
                    )}

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <div className="col-span-2">
                            <Label htmlFor="rd-vendor" flag={flag('vendor')}>Vendor / store</Label>
                            <input id="rd-vendor" className={`input h-9 ${flag('vendor') ? 'border-warning' : ''}`} value={d.vendor} onChange={e => set({ vendor: e.target.value })} />
                        </div>
                        <div>
                            <Label htmlFor="rd-kind">Type</Label>
                            <select id="rd-kind" className="input h-9 pr-8" value={d.kind} onChange={e => set({ kind: e.target.value as DocumentKind })}>
                                {DOCUMENT_KINDS.map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label htmlFor="rd-date" flag={flag('documentDate')}>Date</Label>
                            <input id="rd-date" type="date" className={`input h-9 ${flag('documentDate') || !d.documentDate ? 'border-warning' : ''}`} value={d.documentDate} onChange={e => set({ documentDate: e.target.value })} />
                        </div>
                        <div>
                            <Label htmlFor="rd-number" flag={flag('documentNumber')}>Number</Label>
                            <input id="rd-number" className="input h-9" value={d.documentNumber} onChange={e => set({ documentNumber: e.target.value })} />
                        </div>
                        <div>
                            <Label htmlFor="rd-cat">Category</Label>
                            <select id="rd-cat" className="input h-9 pr-8" value={d.category} onChange={e => set({ category: e.target.value })}>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        {(d.kind === 'supplier_invoice' || d.dueDate) && (
                            <div>
                                <Label htmlFor="rd-due" flag={flag('dueDate')}>Due</Label>
                                <input id="rd-due" type="date" className="input h-9" value={d.dueDate} onChange={e => set({ dueDate: e.target.value })} />
                            </div>
                        )}
                        <div>
                            <Label htmlFor="rd-pay">Paid by</Label>
                            <input id="rd-pay" className="input h-9" value={d.paymentMethod} placeholder="—" onChange={e => set({ paymentMethod: e.target.value })} />
                        </div>
                        {d.cardLast4 && (
                            <div>
                                <Label htmlFor="rd-last4">Card ending</Label>
                                <input id="rd-last4" inputMode="numeric" maxLength={4} className="input h-9 tabular-nums" value={d.cardLast4} onChange={e => set({ cardLast4: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                            </div>
                        )}
                    </div>

                    {/* lines */}
                    <div>
                        <div className="mb-1 flex items-baseline justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Lines ({d.lines.length})<CheckTag level={flag('lines')} /></span>
                            <button type="button" className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
                                onClick={() => set({ lines: [...d.lines, { key: newLineKey(), description: '', quantity: 1, unit: '', unitPrice: null, amount: null }] })}>
                                Add line
                            </button>
                        </div>
                        {d.lines.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No lines were read. The total below is saved on its own, or add lines.</p>
                        ) : (
                            <div className={`max-h-[34vh] overflow-y-auto rounded-md border ${flag('lines') === 'low' ? 'border-warning' : 'border-border'}`}>
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-card text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                                        <tr>
                                            <th className="px-2 py-1 font-semibold">Item</th>
                                            <th className="hidden w-16 px-1 py-1 text-right font-semibold sm:table-cell">Qty</th>
                                            <th className="hidden w-20 px-1 py-1 text-right font-semibold sm:table-cell">Price</th>
                                            <th className="w-24 px-1 py-1 text-right font-semibold">Amount</th>
                                            <th className="w-7" aria-label="Remove" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {d.lines.map(l => (
                                            <tr key={l.key} className="border-t border-border align-top">
                                                <td className="px-1 py-1">
                                                    <input aria-label="Item" className="input h-9" value={l.description} onChange={e => setLine(l.key, { description: e.target.value })} />
                                                    <span className="mt-0.5 block px-1 text-[11px] text-muted-foreground sm:hidden">
                                                        {l.quantity !== null ? `${l.quantity}${l.unit ? ` ${l.unit}` : ''}` : ''}{l.quantity !== null && l.unitPrice !== null ? ' × ' : ''}{l.unitPrice !== null ? l.unitPrice.toFixed(2) : ''}
                                                    </span>
                                                </td>
                                                <td className="hidden px-1 py-1 sm:table-cell">
                                                    <input aria-label="Quantity" inputMode="decimal" className="input h-9 text-right tabular-nums" value={l.quantity ?? ''}
                                                        onChange={e => { const n = Number(e.target.value); setLine(l.key, { quantity: e.target.value.trim() && Number.isFinite(n) ? n : null }); }} />
                                                </td>
                                                <td className="hidden px-1 py-1 sm:table-cell">
                                                    <AmountInput label="Price" value={l.unitPrice} onChange={v => setLine(l.key, { unitPrice: v })} allowNegative={neg} />
                                                </td>
                                                <td className="px-1 py-1">
                                                    <AmountInput label="Amount" value={l.amount ?? lineAmount({ ...l, amount: null })} onChange={v => setLine(l.key, { amount: v })} allowNegative />
                                                </td>
                                                <td className="py-1 pr-1 text-right">
                                                    <button type="button" aria-label="Remove line" className="h-9 w-6 text-muted-foreground hover:text-destructive" onClick={() => set({ lines: d.lines.filter(x => x.key !== l.key) })}>×</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* totals + the live check */}
                    <div className="ml-auto grid w-full max-w-xs grid-cols-[1fr_8rem] items-center gap-x-3 gap-y-1.5 text-sm">
                        <span className="text-muted-foreground">Lines</span>
                        <span className="text-right tabular-nums">{check.linesSum.toFixed(2)}</span>
                        <span className="text-muted-foreground">Subtotal<CheckTag level={flag('subtotal')} /></span>
                        <AmountInput label="Subtotal" value={d.subtotal} onChange={v => set({ subtotal: v })} flag={flag('subtotal')} allowNegative={neg} />
                        <span className="text-muted-foreground">Tax<CheckTag level={flag('tax')} /></span>
                        <AmountInput label="Tax" value={d.tax} onChange={v => set({ tax: v })} flag={flag('tax')} allowNegative={neg} />
                        <span className="font-semibold">Total paid{d.currency ? ` (${d.currency})` : ''}<CheckTag level={flag('total')} /></span>
                        <AmountInput label="Total paid" value={d.total} onChange={v => set({ total: v })} flag={flag('total')} className="font-semibold" allowNegative={neg} />
                    </div>
                    <p role="status" aria-live="polite" className={`text-right text-xs font-medium ${check.status === 'ok' ? 'text-success' : check.status === 'off' ? 'text-destructive' : 'text-muted-foreground'}`}>
                        <span aria-hidden="true">{check.status === 'ok' ? '✓ ' : check.status === 'off' ? '≠ ' : ''}</span>{check.message}
                        {check.unpricedLines > 0 && ` ${check.unpricedLines} line${check.unpricedLines === 1 ? ' has' : 's have'} no amount.`}
                    </p>

                    {/* job: the one this expense is saved to; a mentioned job is only a hint */}
                    <div className="border-t border-border pt-3 text-sm">
                        <span className="text-muted-foreground">Saved to job: </span><span className="font-semibold">{job.name}</span>
                        {d.jobReference && <span className="text-muted-foreground"> · reference on the document: {d.jobReference}</span>}
                        {suggestion && (
                            <p className="mt-1 text-xs text-warning">
                                This document {suggestion.reason} (job “{suggestion.job.name}”). If it belongs there, cancel and read it from that job’s expense log.
                            </p>
                        )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">Read by AI from your file. Number, due date, payment and summary go into the expense notes.</p>
                </section>
            </div>
        </Modal>
    );
};

export default ReadDocumentAI;
