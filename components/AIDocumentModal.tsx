import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangleIcon, ArrowRightIcon, CheckIcon, ChevronDownIcon, RefreshCwIcon, SparklesIcon, StarIcon, UndoIcon, XCircleIcon } from './Icons.tsx';
import AIVoiceInput from './AIVoiceInput.tsx';
import { useContractorAI, type AIGeneratedDocument } from '../src/hooks/useContractorAI.ts';
import { resolveFormType, resolveMasterDocumentType } from '../src/config/docTypeMap.ts';
import { DOC_LABELS, getSchema, toPlainText, type DocKey, type FieldSpec } from '../src/config/documentFieldRequirements.ts';
import { dispatchUpgradeEvent, isAiLimitCode } from '../src/ai/events.ts';
import { formatMoney } from '../utils/money.ts';

interface AIDocumentModalProps {
    jobId: string;
    /** FormType value or legacy spelling ("WorkOrder", "ChangeOrder"). */
    formTypeRestriction?: string;
    /** Ignored: the AI never saves; the form saves when the user presses Save. */
    saveToDb?: boolean;
    onClose: () => void;
    /** docs[0].data is Partial<TypeData> with exact form field names. */
    onSuccess: (newDocuments: AIGeneratedDocument[], inputText?: string) => void;
}

/** What people typically say for each form (tap to start from it). */
const EXAMPLES: Record<DocKey, string[]> = {
    INVOICE: ['2 exterior doors at $450 each, 6 hours labor at $75, due in 30 days, 8.25% tax', '$500 deposit already paid, $50 discount, thank the client'],
    ESTIMATE: ['Demo and haul-away $1,200; 120 sq ft of tile at $14; valid 30 days', 'Bathroom remodel, 8% tax, $150 discount, 50% deposit to start'],
    WORK_ORDER: ['Replace the kitchen faucet and fix the leak, 3 hours, $240, assigned to Alex', 'Install 4 recessed lights in the living room tomorrow'],
    DAILY_REPORT: ['Framed the east wall, 3 crew, 24 labor hours, sunny 72°F', 'Electrical rough-in done, inspection passed, drywall starts Monday'],
    TIME_SHEET: ['Jordan Mitchell, 8 hours today plus 1.5 overtime, framing the deck'],
    MATERIAL_LOG: ['20 studs at $8 and 4 boxes of nails at $18.50 from City Supply'],
    EXPENSE_LOG: ['$64.50 of gas at Shell for the material run'],
    WARRANTY: ['2 years on labor and installation defects, job completed today'],
    NOTE: ['Call the inspector Monday about the framing, bring the permit'],
    RECEIPT: ['$975 received by check for invoice INV-2026-11-004'],
    CHANGE_ORDER: ['Add two exterior doors at $450 each, client request, contract was $12,500'],
    PURCHASE_ORDER: ['40 studs at $6.50 from City Supply, deliver Friday to the job site'],
};

const SAMPLE_PROMPT = 'Fill every box with realistic sample data (this is a test).';

/** Boxes the user fills by hand (job / company boxes, design and colours come from the app). */
function fillableFields(docType: DocKey | null): Array<[string, FieldSpec]> {
    if (!docType) return [];
    return Object.entries(getSchema(docType)).filter(([, s]) => !s.source && s.kind !== 'template' && s.kind !== 'colors');
}

const lineTotal = (row: Record<string, unknown>) => Number(row.quantity || 0) * Number((row.rate ?? row.unitCost) || 0);

function formatDate(ymd: string): string {
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return ymd;
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function previewValue(spec: FieldSpec, value: unknown): string {
    switch (spec.kind) {
        case 'money': return formatMoney(value);
        case 'percent': return `${value}%`;
        case 'date': return formatDate(String(value));
        case 'tags': return Array.isArray(value) ? value.join(', ') : String(value);
        case 'colors': return '';
        default: {
            const text = toPlainText(value).replace(/\s+/g, ' ').trim();
            return text.length > 160 ? `${text.slice(0, 157)}…` : text;
        }
    }
}

/**
 * "Fill with AI" inside a form. Two steps in one dialog: describe the work (typed, dictated or from an
 * example), then review exactly which boxes get which value before anything touches the form.
 * Rendered in a portal: the form header uses backdrop-blur, which would otherwise trap this fixed
 * dialog inside the header (the "stuck at the top" bug). Bottom sheet on phones, centered dialog on
 * larger screens.
 */
export const AIDocumentModal: React.FC<AIDocumentModalProps> = ({ jobId, formTypeRestriction, onClose, onSuccess }) => {
    const { processAIData, cancel, isProcessing, error, errorCode } = useContractorAI();
    const [input, setInput] = useState('');
    const [result, setResult] = useState<AIGeneratedDocument | null>(null);
    const [showFields, setShowFields] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const titleId = useId();
    const docType = resolveMasterDocumentType(formTypeRestriction || '');
    const label = (docType ? DOC_LABELS[docType] : resolveFormType(formTypeRestriction || '')) || 'document';
    const fields = useMemo(() => fillableFields(docType), [docType]);
    const keyFields = fields.filter(([, s]) => s.ask);
    const examples = docType ? EXAMPLES[docType] : [];

    const close = () => { cancel(); onClose(); };
    const closeRef = useRef(close);
    closeRef.current = close;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
        window.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
    }, []);

    const generate = async () => {
        if (!input.trim() || isProcessing) return;
        const docs = await processAIData(input, formTypeRestriction, jobId);
        if (docs?.length) setResult(docs[0]);
    };
    const apply = () => { if (result) onSuccess([result], input); };
    const pickExample = (text: string) => {
        setInput(text);
        requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(text.length, text.length); });
    };
    const backToEdit = () => { setResult(null); requestAnimationFrame(() => textareaRef.current?.focus()); };

    // Review rows: every filled box in form order (line items get their own list).
    const filled = useMemo(() => {
        if (!result || !docType) return { rows: [] as Array<{ key: string; label: string; value: string }>, items: [] as Array<Record<string, unknown>>, itemsLabel: '' };
        const schema = getSchema(docType);
        const data = result.data;
        const rows: Array<{ key: string; label: string; value: string }> = [];
        let items: Array<Record<string, unknown>> = [];
        let itemsLabel = '';
        for (const [key, spec] of Object.entries(schema)) {
            const value = data[key];
            if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;
            if (spec.kind === 'lineItems' || spec.kind === 'materialItems') { items = value as Array<Record<string, unknown>>; itemsLabel = spec.label; continue; }
            const text = previewValue(spec, value);
            if (text) rows.push({ key, label: spec.label, value: text });
        }
        return { rows, items, itemsLabel };
    }, [result, docType]);
    const boxCount = filled.rows.length + (filled.items.length ? 1 : 0);
    const stillEmpty = result && docType ? (result.missing_fields || []).map(k => getSchema(docType)[k]?.label).filter(Boolean) : [];

    // Phones: the sheet opens without the keyboard covering it (tap the box or an example to type).
    const finePointer = typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(pointer: fine)').matches;
    const phase: 'describe' | 'working' | 'review' = result ? 'review' : isProcessing ? 'working' : 'describe';
    const lower = String(label).toLowerCase();

    const fieldList = (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px] sm:grid-cols-1">
            {fields.map(([key, spec]) => (
                <li key={key} className="flex min-w-0 items-center gap-2 text-foreground/80">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${spec.ask ? 'bg-primary' : 'bg-border'}`} aria-hidden />
                    <span className="truncate">{spec.label}</span>
                </li>
            ))}
        </ul>
    );

    const dialog = (
        <div className="fixed inset-0 z-[210] flex items-end justify-center sm:items-center sm:p-6" role="presentation">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-fade-in" onClick={close} aria-hidden />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="ai-fill-frame relative w-full animate-fade-in-up sm:max-w-[760px] sm:animate-zoom-in"
            >
                <div className="ai-fill-frame-inner flex max-h-[92dvh] flex-col sm:max-h-[min(88dvh,720px)]">
                    <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden />

                    {/* Header */}
                    <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-3 sm:px-7 sm:pt-6">
                        <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
                                <SparklesIcon className="h-3.5 w-3.5" /> AI fill
                                <span className="ml-1 font-semibold normal-case tracking-normal text-muted-foreground">
                                    · Step {phase === 'review' ? '2 of 2: review' : '1 of 2: describe'}
                                </span>
                            </p>
                            <h2 id={titleId} className="mt-1 text-lg font-bold tracking-tight text-foreground sm:text-xl">
                                {phase === 'review' ? `Ready to fill ${boxCount} box${boxCount === 1 ? '' : 'es'}` : `Fill this ${lower}`}
                            </h2>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                                {phase === 'review'
                                    ? 'Check each value. Nothing changes in the form until you press Fill.'
                                    : 'Describe the work in your own words. I only use what you tell me, unless you ask for sample data.'}
                            </p>
                        </div>
                        <button type="button" onClick={close} aria-label="Close" className="-mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
                            <XCircleIcon className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-1.5 sm:px-7">
                        {phase !== 'review' ? (
                            <div className="sm:grid sm:grid-cols-[minmax(0,1fr)_200px] sm:gap-7">
                                <div className="min-w-0 space-y-4">
                                    <div className={`rounded-2xl border bg-card shadow-sm transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15 ${error ? 'border-destructive/50' : 'border-input'}`}>
                                        <label htmlFor={`${titleId}-input`} className="sr-only">What should go into the {lower}?</label>
                                        <textarea
                                            id={`${titleId}-input`}
                                            ref={textareaRef}
                                            className="block min-h-[132px] w-full resize-none rounded-t-2xl bg-transparent px-4 pb-2 pt-3.5 text-base leading-6 text-foreground placeholder:text-muted-foreground/70 focus:outline-none disabled:opacity-60 sm:min-h-[168px]"
                                            placeholder={examples[0] ? `e.g. ${examples[0]}` : 'Describe the work, items and prices…'}
                                            value={input}
                                            onChange={e => setInput(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void generate(); } }}
                                            disabled={isProcessing}
                                            autoFocus={finePointer}
                                        />
                                        <div className="flex items-center gap-2 px-2 pb-2">
                                            <AIVoiceInput
                                                variant="compact"
                                                disabled={isProcessing}
                                                onTranscript={text => setInput(prev => prev + (prev && !/\s$/.test(prev) ? ' ' : '') + text)}
                                            />
                                            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                                {isProcessing ? 'Reading your notes and filling the boxes…' : <><span className="sm:hidden">Type or dictate</span><span className="hidden sm:inline">Type or dictate · Ctrl+Enter to fill</span></>}
                                            </span>
                                            {input && !isProcessing && (
                                                <button type="button" onClick={() => setInput('')} className="rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Clear</button>
                                            )}
                                        </div>
                                    </div>

                                    {error && (
                                        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-foreground" role="alert">
                                            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                                            <div className="min-w-0">
                                                {error}
                                                {isAiLimitCode(errorCode) && (
                                                    <button type="button" onClick={() => dispatchUpgradeEvent(error)} className="ml-2 inline-flex items-center gap-1 font-semibold text-primary">
                                                        <StarIcon className="h-3.5 w-3.5" /> See plans
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {phase === 'working' ? (
                                        <div className="space-y-2" aria-hidden>
                                            {[72, 54, 64].map(w => (
                                                <div key={w} className="flex items-center gap-3">
                                                    <div className="skeleton h-3 w-24" />
                                                    <div className="skeleton h-3" style={{ width: `${w}%` }} />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div>
                                            <p className="mb-2 text-xs font-semibold text-muted-foreground">Start from an example</p>
                                            <div className="flex flex-col gap-1.5">
                                                {examples.map(text => (
                                                    <button
                                                        key={text}
                                                        type="button"
                                                        onClick={() => pickExample(text)}
                                                        className="group flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] leading-5 text-foreground ring-1 ring-inset ring-border transition hover:bg-primary/5 hover:ring-primary/40"
                                                    >
                                                        <span className="min-w-0 flex-1">“{text}”</span>
                                                        <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                                                    </button>
                                                ))}
                                                <button
                                                    type="button"
                                                    onClick={() => pickExample(SAMPLE_PROMPT)}
                                                    className="group flex min-h-[44px] items-center gap-3 rounded-xl border border-dashed border-primary/40 px-3 py-2 text-left text-[13px] leading-5 text-foreground transition hover:bg-primary/5"
                                                >
                                                    <SparklesIcon className="h-4 w-4 shrink-0 text-primary" />
                                                    <span className="min-w-0 flex-1"><span className="font-semibold">Sample data in every box</span> <span className="text-muted-foreground">for testing the {lower}</span></span>
                                                    <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* What can be filled */}
                                <aside className="mt-4 border-t border-border pt-3 sm:mt-0 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0" aria-label="Boxes the AI can fill">
                                    <button
                                        type="button"
                                        onClick={() => setShowFields(v => !v)}
                                        className="flex w-full items-center justify-between gap-2 py-1 text-left text-xs font-semibold text-muted-foreground sm:pointer-events-none"
                                        aria-expanded={showFields}
                                    >
                                        <span>Boxes I can fill <span className="font-normal">({fields.length})</span></span>
                                        <ChevronDownIcon className={`h-4 w-4 transition sm:hidden ${showFields ? 'rotate-180' : ''}`} />
                                    </button>
                                    <div className={`${showFields ? 'block' : 'hidden'} mt-2 sm:block`}>
                                        {fieldList}
                                        {keyFields.length > 0 && (
                                            <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                                                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden /> Key details: {keyFields.map(([, s]) => s.label.toLowerCase()).join(', ')}
                                            </p>
                                        )}
                                        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">Client, job and company boxes come from the job and your profile.</p>
                                    </div>
                                </aside>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {(result?.sample || result?.reply) && (
                                    <p className="flex items-start gap-2 rounded-xl bg-primary/5 px-3 py-2.5 text-[13px] text-foreground">
                                        <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                        <span>{result?.sample ? 'Sample data: every value below is made up for testing. Edit anything before you send the document.' : result?.reply}</span>
                                    </p>
                                )}
                                {filled.rows.length > 0 && (
                                    <dl className="divide-y divide-border/70 rounded-2xl ring-1 ring-inset ring-border">
                                        {filled.rows.map(r => (
                                            <div key={r.key} className="px-4 py-2.5 text-[13px] sm:grid sm:grid-cols-[minmax(120px,32%)_1fr] sm:items-baseline sm:gap-3">
                                                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-[13px]"><CheckIcon className="h-3.5 w-3.5 shrink-0 text-success" />{r.label}</dt>
                                                <dd className="mt-0.5 min-w-0 break-words pl-5 font-medium text-foreground sm:mt-0 sm:pl-0">{r.value}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                )}
                                {filled.items.length > 0 && (
                                    <div className="rounded-2xl ring-1 ring-inset ring-border">
                                        <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-2.5 text-[13px]">
                                            <span className="flex items-center gap-1.5 text-muted-foreground"><CheckIcon className="h-3.5 w-3.5 text-success" />{filled.itemsLabel}</span>
                                            <span className="font-semibold text-foreground">{filled.items.length} line{filled.items.length === 1 ? '' : 's'} · {formatMoney(filled.items.reduce((s, i) => s + lineTotal(i), 0))}</span>
                                        </div>
                                        <ul className="divide-y divide-border/50">
                                            {filled.items.slice(0, 6).map((item, i) => (
                                                <li key={String(item.id || i)} className="flex items-baseline gap-3 px-4 py-2 text-[13px]">
                                                    <span className="min-w-0 flex-1 break-words text-foreground">{String(item.description ?? item.name ?? '')}</span>
                                                    <span className="shrink-0 tabular-nums text-muted-foreground">{Number(item.quantity || 0)} × {formatMoney(item.rate ?? item.unitCost)}</span>
                                                </li>
                                            ))}
                                            {filled.items.length > 6 && <li className="px-4 py-2 text-xs text-muted-foreground">+ {filled.items.length - 6} more</li>}
                                        </ul>
                                    </div>
                                )}
                                {stillEmpty.length > 0 && (
                                    <p className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-xs text-foreground">
                                        <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                                        <span>Still empty: {stillEmpty.join(', ').toLowerCase()}. You can type them in the form.</span>
                                    </p>
                                )}
                                <p className="text-xs text-muted-foreground">Your request: “{input.trim()}”</p>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex shrink-0 items-center gap-2 border-t border-border bg-muted/30 px-5 pt-3 sm:px-7 sm:pb-4" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                        {phase === 'review' ? (
                            <>
                                <button type="button" className="btn btn-ghost" onClick={backToEdit}><UndoIcon className="h-4 w-4" /> Change request</button>
                                <span className="flex-1" />
                                <button type="button" className="btn btn-primary min-w-[132px]" onClick={apply} autoFocus>
                                    <CheckIcon className="h-4 w-4" /> Fill {boxCount} box{boxCount === 1 ? '' : 'es'}
                                </button>
                            </>
                        ) : (
                            <>
                                <span className="flex-1" />
                                <button type="button" className="btn btn-ghost" onClick={isProcessing ? cancel : close}>{isProcessing ? 'Stop' : 'Cancel'}</button>
                                <button type="button" className="btn btn-primary min-w-[132px]" onClick={() => void generate()} disabled={isProcessing || !input.trim()}>
                                    {isProcessing ? <RefreshCwIcon className="h-4 w-4 animate-spin" /> : <SparklesIcon className="h-4 w-4" />}
                                    {isProcessing ? 'Filling…' : 'Fill the form'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
};

export default AIDocumentModal;
