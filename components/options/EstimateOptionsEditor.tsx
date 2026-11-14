/**
 * Good / better / best options in the estimate form (competitor gap #6). The rules live in lib/estimateOptions.ts;
 * this file is only the editing UI:
 *   - option tabs (name, total, Recommended / client's choice) + "In every option" (shared lines) + add option;
 *   - the selected option: name, short description, Recommended, "Start from…", "Copy lines to…", remove, its lines;
 *   - its totals (discount and tax % apply to every option);
 *   - the choice bar: the client's pick (or "Client chose…" recorded by the contractor) and "Apply chosen option";
 *   - the applied strip shown on an estimate that became one of its options.
 * Tabs, the choice bar and "Apply" stay usable on a signed (locked) estimate; editing does not.
 */
import React, { useMemo, useState } from 'react';
import type { EstimateData, InventoryItem, LineItem, SavedItem } from '../../types.ts';
import { cx } from '../commsKit.tsx';
import { computeDocumentCost, formatMoney, roundMoney } from '../../utils/money.ts';
import LineItemsEditor from '../forms/LineItemsEditor.tsx';
import TotalsPanel from '../forms/TotalsPanel.tsx';
import { ConfirmDialog } from '../forms/FormShell.tsx';
import { LockedFieldset } from '../forms/SignedLock.tsx';
import { PlusIcon } from '../Icons.tsx';
import { formatDate } from '../../utils/templates/format.ts';
import {
    OPTION_DESCRIPTION_MAX, OPTION_MAX, OPTION_MIN, OPTION_NAME_MAX, addOption, defaultOptionName, optionName, canUndoApply, choiceOf, clientChoiceOf, copyOptionLines,
    effectiveOption, findOption, optionLines, optionTotals, readOptionSet, recordContractorChoice, removeOption, setRecommended,
    summarizeOptions, updateOption, type OptionSet,
} from '../../lib/estimateOptions.ts';

const SHARED = 'shared';
const shortDate = (iso?: string) => (iso ? formatDate(iso, { locale: 'en-US' }) : '');
const isMeaningful = (li: LineItem) => Boolean(String(li.description || '').trim()) || Number(li.rate) !== 0;
const linesLabel = (n: number) => `${n} line${n === 1 ? '' : 's'}`;

/** "B · Better" */
export const optionTitle = (set: OptionSet, id: string): string => {
    const i = set.options.findIndex(o => o.id === id);
    return i < 0 ? '' : `${String.fromCharCode(65 + i)} · ${optionName(set.options[i], i)}`;
};

interface EditorProps {
    data: EstimateData;
    set: OptionSet;
    /** option edits (the form re-syncs lineItems to the option that counts) */
    onSetChange: (fn: (set: OptionSet) => OptionSet) => void;
    /** discount / tax % (apply to every option) */
    onAdjust: (patch: { discount?: number; taxRate?: number }) => void;
    onTurnOff: () => void;
    locked: boolean;
    showCosts: boolean;
    savedItems?: SavedItem[];
    inventoryItems?: InventoryItem[];
    availableStock?: (item: LineItem) => number | null;
}

export const EstimateOptionsEditor: React.FC<EditorProps> = ({
    data, set, onSetChange, onAdjust, onTurnOff, locked, showCosts, savedItems = [], inventoryItems = [], availableStock,
}) => {
    const summaries = useMemo(() => summarizeOptions(data, set), [data, set]);
    const [selected, setSelected] = useState<string>(() => set.recommendedId || set.options[0].id);
    const [pendingCopy, setPendingCopy] = useState<string | null>(null);
    const [pendingRemove, setPendingRemove] = useState(false);
    const [confirmOff, setConfirmOff] = useState(false);
    const [note, setNote] = useState('');
    const current = selected === SHARED ? null : findOption(set, selected) || set.options[0];
    const tab = current ? current.id : SHARED;
    const sharedCount = set.sharedLineItems.filter(isMeaningful).length;
    const sharedTotal = roundMoney(set.sharedLineItems.reduce((a, li) => a + Number(li.quantity || 0) * Number(li.rate || 0), 0));
    const eff = effectiveOption(data, set);
    const effTitle = eff ? optionTitle(set, eff.id) : '';

    const totals = current ? optionTotals(data, set, current.id) : null;
    const cost = current ? computeDocumentCost({ lineItems: optionLines(set, current.id) }) : 0;
    const revenue = totals ? roundMoney(totals.subtotal - totals.discount) : 0;
    const profit = roundMoney(revenue - cost);
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    const flash = (text: string) => { setNote(text); window.setTimeout(() => setNote(n => (n === text ? '' : n)), 3500); };

    const startFrom = (fromId: string, mode: 'replace' | 'append') => {
        if (!current) return;
        onSetChange(s => copyOptionLines(s, fromId, current.id, mode));
        setPendingCopy(null);
        flash(`${mode === 'replace' ? 'Started from' : 'Added the lines of'} ${optionTitle(set, fromId)}.`);
    };
    const copyTo = (toId: string) => {
        if (!current || !toId) return;
        const n = current.lineItems.length;
        onSetChange(s => copyOptionLines(s, current.id, toId, 'append'));
        flash(`Copied ${linesLabel(n)} to ${optionTitle(set, toId)}.`);
    };

    return (
        <div className="space-y-4">
            {/* tabs: options + shared lines; usable on a signed estimate (view only) */}
            <div role="tablist" aria-label="Estimate options" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {summaries.map(s => {
                    const on = tab === s.option.id;
                    return (
                        <button
                            key={s.option.id}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            onClick={() => setSelected(s.option.id)}
                            className={cx(
                                'min-w-[132px] max-w-[200px] shrink-0 rounded-xl border px-3 py-2 text-left transition-colors',
                                on ? 'border-primary bg-primary/5 shadow-soft' : 'border-border bg-background/60 hover:border-primary/40',
                            )}
                        >
                            <span className="flex items-baseline gap-1.5">
                                <span className="text-[11px] font-bold text-muted-foreground">{s.letter}</span>
                                <span className="truncate text-sm font-semibold text-foreground">{optionName(s.option, s.index)}</span>
                            </span>
                            <span className="block text-base font-bold tabular-nums text-foreground">{formatMoney(s.totals.total)}</span>
                            <span className="block min-h-[16px] text-[11px] font-semibold">
                                {s.chosen ? <span className="text-success">Client’s choice</span> : s.recommended ? <span className="text-primary">Recommended</span> : <span className="text-transparent">·</span>}
                            </span>
                        </button>
                    );
                })}
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === SHARED}
                    onClick={() => setSelected(SHARED)}
                    className={cx(
                        'min-w-[132px] shrink-0 rounded-xl border border-dashed px-3 py-2 text-left transition-colors',
                        tab === SHARED ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                    )}
                >
                    <span className="block text-sm font-semibold text-foreground">In every option</span>
                    <span className="block text-sm tabular-nums text-muted-foreground">{sharedCount ? `${linesLabel(sharedCount)} · ${formatMoney(sharedTotal)}` : 'No shared lines'}</span>
                </button>
                {!locked && set.options.length < OPTION_MAX && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm min-h-[40px] shrink-0 self-center"
                        onClick={() => {
                            const next = addOption(set, current?.id);
                            const added = next.options[next.options.length - 1];
                            onSetChange(() => next);
                            if (added) setSelected(added.id);
                        }}
                    >
                        <PlusIcon className="h-4 w-4" /> Add option
                    </button>
                )}
            </div>

            {current ? (
                <div className="space-y-4 rounded-2xl border border-border p-3 sm:p-4" role="tabpanel" aria-label={`Option ${optionTitle(set, current.id)}`}>
                    <LockedFieldset locked={locked} className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
                            <div>
                                <label className="label" htmlFor={`opt-name-${current.id}`}>Option name</label>
                                <input
                                    id={`opt-name-${current.id}`}
                                    className="input min-h-[44px]"
                                    value={current.name}
                                    maxLength={OPTION_NAME_MAX}
                                    onChange={e => onSetChange(s => updateOption(s, current.id, { name: e.target.value }))}
                                    onBlur={e => { if (!e.target.value.trim()) onSetChange(s => updateOption(s, current.id, { name: defaultOptionName(s.options.findIndex(o => o.id === current.id)) })); }}
                                />
                            </div>
                            <div>
                                <label className="label" htmlFor={`opt-desc-${current.id}`}>Short description (optional)</label>
                                <input
                                    id={`opt-desc-${current.id}`}
                                    className="input min-h-[44px]"
                                    value={current.description || ''}
                                    maxLength={OPTION_DESCRIPTION_MAX}
                                    placeholder="What’s different, e.g. 50-year shingles, 10-year labor warranty"
                                    onChange={e => onSetChange(s => updateOption(s, current.id, { description: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                            <label className="flex min-h-[40px] cursor-pointer items-center gap-2 font-medium text-foreground">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-primary"
                                    checked={set.recommendedId === current.id}
                                    onChange={e => onSetChange(s => setRecommended(s, e.target.checked ? current.id : null))}
                                />
                                Recommended
                            </label>
                            <label className="flex items-center gap-2 text-muted-foreground">
                                <span className="shrink-0">Start from</span>
                                <select
                                    className="input h-10 min-h-0 w-auto py-1.5 pr-8 text-sm"
                                    value=""
                                    onChange={e => {
                                        const from = e.target.value;
                                        if (!from) return;
                                        if (current.lineItems.some(isMeaningful)) setPendingCopy(from); else startFrom(from, 'replace');
                                    }}
                                    aria-label="Start this option from another option"
                                >
                                    <option value="">option…</option>
                                    {set.options.filter(o => o.id !== current.id).map(o => <option key={o.id} value={o.id}>{optionTitle(set, o.id)}</option>)}
                                </select>
                            </label>
                            <label className="flex items-center gap-2 text-muted-foreground">
                                <span className="shrink-0">Copy lines to</span>
                                <select
                                    className="input h-10 min-h-0 w-auto py-1.5 pr-8 text-sm"
                                    value=""
                                    onChange={e => copyTo(e.target.value)}
                                    aria-label="Copy this option's lines to another option"
                                    disabled={!current.lineItems.length}
                                >
                                    <option value="">option…</option>
                                    {set.options.filter(o => o.id !== current.id).map(o => <option key={o.id} value={o.id}>{optionTitle(set, o.id)}</option>)}
                                </select>
                            </label>
                            {set.options.length > OPTION_MIN && (
                                <button type="button" className="btn btn-ghost btn-sm min-h-[40px] text-destructive" onClick={() => setPendingRemove(true)}>
                                    Remove option
                                </button>
                            )}
                        </div>
                        {note && <p className="text-xs font-medium text-success" role="status">{note}</p>}
                        <LineItemsEditor
                            items={current.lineItems}
                            onChange={items => onSetChange(s => updateOption(s, current.id, { lineItems: items }))}
                            showCost={showCosts}
                            rateLabel="Price"
                            savedItems={savedItems}
                            inventoryItems={inventoryItems}
                            availableStock={availableStock}
                            addLabel={`Add line to ${optionName(current, set.options.indexOf(current))}`}
                        />
                    </LockedFieldset>
                    {showCosts && totals && (
                        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:grid-cols-4">
                            <div><p className="label mb-1">Revenue</p><p className="text-lg font-bold tabular-nums">{formatMoney(revenue)}</p></div>
                            <div><p className="label mb-1">Your cost</p><p className="text-lg font-bold tabular-nums">{formatMoney(cost)}</p></div>
                            <div><p className="label mb-1">Profit</p><p className={cx('text-lg font-bold tabular-nums', profit >= 0 ? 'text-success' : 'text-destructive')}>{formatMoney(profit)}</p></div>
                            <div><p className="label mb-1">Margin</p><p className={cx('text-lg font-bold tabular-nums', margin >= 30 ? 'text-success' : margin >= 15 ? 'text-warning' : 'text-destructive')}>{margin.toFixed(1)}%</p></div>
                        </div>
                    )}
                    {totals && (
                        <LockedFieldset locked={locked}>
                            <TotalsPanel
                                totals={totals}
                                totalLabel={`${optionName(current, set.options.indexOf(current))} total`}
                                adjustments={{ discount: data.discount, taxRate: data.taxRate, fields: ['discount', 'taxRate'], onChange: onAdjust }}
                            >
                                <p className="pt-1 text-right text-xs text-muted-foreground">
                                    {sharedCount ? `Includes the ${linesLabel(sharedCount)} in every option. ` : ''}Discount and tax apply to every option.
                                </p>
                            </TotalsPanel>
                        </LockedFieldset>
                    )}
                </div>
            ) : (
                <div className="space-y-3 rounded-2xl border border-dashed border-border p-3 sm:p-4" role="tabpanel" aria-label="Lines in every option">
                    <p className="text-sm text-muted-foreground">
                        Lines the client gets whichever option they choose (permit, disposal, cleanup). They are added to every option’s total and printed once.
                    </p>
                    <LockedFieldset locked={locked}>
                        <LineItemsEditor
                            items={set.sharedLineItems}
                            onChange={items => onSetChange(s => ({ ...s, sharedLineItems: items }))}
                            showCost={showCosts}
                            rateLabel="Price"
                            savedItems={savedItems}
                            inventoryItems={inventoryItems}
                            availableStock={availableStock}
                            addLabel="Add a line for every option"
                        />
                    </LockedFieldset>
                </div>
            )}

            {!locked && (
                <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>Until the client chooses, invoices, job budget and the pipeline use {effTitle ? <span className="font-semibold text-foreground">{effTitle}</span> : 'the Recommended option'}{eff?.reason === 'lowest' ? ' (lowest total; mark one Recommended to change it)' : eff?.reason === 'recommended' ? ' (Recommended)' : ''}.</span>
                    <button type="button" className="btn btn-ghost btn-sm min-h-[36px]" onClick={() => setConfirmOff(true)}>Use one total instead</button>
                </p>
            )}

            <ConfirmDialog
                open={pendingCopy !== null}
                title={`Start ${current ? optionTitle(set, current.id) : 'this option'} from ${pendingCopy ? optionTitle(set, pendingCopy) : ''}?`}
                message={`Its ${linesLabel(current?.lineItems.length || 0)} are replaced by a copy of ${pendingCopy ? optionTitle(set, pendingCopy) : 'the other option'}’s lines. You can also add them below the current lines.`}
                confirmLabel="Replace lines"
                cancelLabel="Cancel"
                extraAction={{ label: 'Add below', onClick: () => pendingCopy && startFrom(pendingCopy, 'append') }}
                onConfirm={() => pendingCopy && startFrom(pendingCopy, 'replace')}
                onCancel={() => setPendingCopy(null)}
            />
            <ConfirmDialog
                open={pendingRemove && !!current}
                title={`Remove ${current ? optionTitle(set, current.id) : 'this option'}?`}
                message="The option and its lines are removed from this estimate."
                confirmLabel="Remove option"
                cancelLabel="Cancel"
                destructive
                onConfirm={() => { if (current) onSetChange(s => removeOption(s, current.id)); setPendingRemove(false); setSelected(set.options.find(o => o.id !== current?.id)?.id || SHARED); }}
                onCancel={() => setPendingRemove(false)}
            />
            <ConfirmDialog
                open={confirmOff}
                title="Use one total again?"
                message={`The estimate keeps ${effTitle || 'the option that counts'}’s lines${sharedCount ? ' and the lines in every option' : ''}. The other options are removed.`}
                confirmLabel="Keep one total"
                cancelLabel="Cancel"
                onConfirm={() => { setConfirmOff(false); onTurnOff(); }}
                onCancel={() => setConfirmOff(false)}
            />
        </div>
    );
};

/**
 * The client's pick and "Apply chosen option". Shown under the options (also on a signed estimate). Without a pick,
 * the contractor can record one ("Client chose…") when the client answered by phone, email or in person.
 */
export const OptionChoiceBar: React.FC<{
    data: EstimateData;
    set: OptionSet;
    /** contractor edits allowed (not signed) */
    canRecord: boolean;
    onRecord: (optionId: string | null) => void;
    onApply: () => void;
    busy?: boolean;
}> = ({ data, set, canRecord, onRecord, onApply, busy }) => {
    const choice = choiceOf(data, set);
    const fromClient = clientChoiceOf(data, set);
    if (!choice) {
        if (!canRecord) return null;
        return (
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">No option chosen yet. The client picks one when they sign online.</p>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="shrink-0">Client told you?</span>
                    <select className="input h-10 min-h-0 w-auto py-1.5 pr-8 text-sm" value="" onChange={e => e.target.value && onRecord(e.target.value)} aria-label="Record the option the client chose">
                        <option value="">They chose…</option>
                        {set.options.map(o => <option key={o.id} value={o.id}>{optionTitle(set, o.id)}</option>)}
                    </select>
                </label>
            </div>
        );
    }
    const total = optionTotals(data, set, choice.optionId).total;
    const who = fromClient ? (fromClient.name || data.clientName || 'The client') : 'You recorded that the client';
    const when = shortDate(choice.at);
    return (
        <div role="status" className="flex flex-col gap-3 rounded-2xl border border-success/30 bg-success/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                    {who} chose <span className="whitespace-nowrap">{optionTitle(set, choice.optionId)}</span> · <span className="tabular-nums">{formatMoney(total)}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {fromClient ? `Signed online${when ? ` on ${when}` : ''}. ` : when ? `Recorded on ${when}. ` : ''}
                    Apply it to make this estimate that option: one total for the invoice, job budget and pipeline.
                </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
                {!fromClient && canRecord && (
                    <button type="button" className="btn btn-ghost btn-sm min-h-[40px]" onClick={() => onRecord(null)} disabled={busy}>Clear</button>
                )}
                <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={onApply} disabled={busy}>Apply chosen option</button>
            </div>
        </div>
    );
};

/** On an estimate that became one of its options: which one, what was offered, and "Back to options". */
export const AppliedOptionStrip: React.FC<{ data: EstimateData; onUndo?: () => void }> = ({ data, onUndo }) => {
    const set = readOptionSet(data);
    if (!set?.appliedId) return null;
    const choice = choiceOf(data, set);
    const summaries = summarizeOptions(data, set);
    return (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
                <p className="font-semibold text-foreground">
                    Option {optionTitle(set, set.appliedId)} applied{choice?.by === 'client' ? ` (chosen by ${choice.name || data.clientName || 'the client'})` : ''}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    Offered: {summaries.map(s => `${s.letter} ${optionName(s.option, s.index)} ${formatMoney(s.totals.total)}`).join(' · ')}
                </p>
            </div>
            {onUndo && (
                <button type="button" className="btn btn-ghost btn-sm min-h-[40px] shrink-0" onClick={onUndo}>Back to options</button>
            )}
        </div>
    );
};

export { canUndoApply, recordContractorChoice };
