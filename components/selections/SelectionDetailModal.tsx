/**
 * Job page › Selections: one selection in a window. What was asked, the options, what the client chose (their name, the
 * date and their words, with the price and the upgrade / credit), the full history, and the actions that fit its state
 * (lib/selections/selectionLogic.ts ownerActions): Approve, Ask for changes, Ask again, Create purchase order, Mark ordered,
 * Cancel order, Close, Reopen, Edit, Delete. While the client's choice stands the options are locked; the window says why.
 * Your cost, SKU and supplier show here with "only you see this".
 */
import React from 'react';
import { chosenOption, chosenPricing, optionPricing, ownerActions, type SelectionOwnerAction } from '../../lib/selections/selectionLogic.ts';
import type { JobSelection, SelectionOption } from '../../lib/selections/selectionTypes.ts';
import {
    ACTION_LABEL, COST_PRIVATE, PRIMARY_ACTIONS, chipLabel, differenceText, differenceTone, dueInfo, historyRows, lockedNote, moneyText, statusTone,
} from '../../lib/selections/selectionView.ts';
import { linkHost, shortDate } from '../../lib/jobFiles/jobFileView.ts';
import { cx } from '../commsKit.tsx';
import { Modal } from '../viewKit.tsx';
import { ExternalLinkIcon, LockIcon } from '../Icons.tsx';
import { StatusChip } from '../jobFiles/ui.tsx';
import StoredImage from './StoredImage.tsx';

const DiffText: React.FC<{ difference: number | null }> = ({ difference }) => {
    const t = differenceText(difference);
    if (!t) return null;
    const tone = differenceTone(difference);
    return <span className={cx('text-xs font-bold', tone === 'down' && 'text-success', tone === 'same' && 'text-muted-foreground')}>{t}</span>;
};

const OptionLine: React.FC<{ option: SelectionOption; allowance: number | null; chosen: boolean }> = ({ option: o, allowance, chosen }) => {
    const p = optionPricing(o, allowance);
    return (
        <li className={cx('flex items-center gap-3 py-2 pl-3 pr-3', chosen && 'bg-primary/5')}>
            <StoredImage path={o.imagePath} alt="" className="h-12 w-12 shrink-0 rounded-lg" fallback={<span aria-hidden className="text-[10px]">—</span>} />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{o.name}{chosen && <span className="ml-1.5 text-xs font-bold text-primary">Chosen</span>}</span>
                {o.description && <span className="block truncate text-xs text-muted-foreground">{o.description}</span>}
            </span>
            <span className="shrink-0 text-right tabular-nums">
                <span className="block text-sm font-semibold">{moneyText(p.total)}</span>
                <DiffText difference={p.difference} />
            </span>
        </li>
    );
};

const SelectionDetailModal: React.FC<{
    selection: JobSelection;
    busy: boolean;
    onClose: () => void;
    onAction: (action: SelectionOwnerAction, s: JobSelection) => void;
}> = ({ selection: s, busy, onClose, onAction }) => {
    const due = dueInfo(s);
    const actions = ownerActions(s);
    const chosen = chosenOption(s);
    const pricing = chosenPricing(s);
    const rows = historyRows(s);
    const locked = lockedNote(s);
    const showChoice = !!chosen && s.status !== 'sent' && s.status !== 'draft';

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            size="lg"
            title={s.title}
            description={(
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <StatusChip tone={statusTone(s.status)}>{chipLabel(s.status)}</StatusChip>
                    {s.room && <span className="font-medium text-foreground">{s.room}</span>}
                    {s.status === 'sent' && due.text && <span className={cx(due.tone === 'late' && 'font-semibold text-destructive')}>{due.text}</span>}
                    {s.allowance !== null && <span>Allowance {moneyText(s.allowance)}</span>}
                    {s.sentAt && <span>Sent {shortDate(s.sentAt)}</span>}
                </span>
            )}
            footer={(
                // phone: the main action across the full width, the rest two by two (four stacked buttons fill the screen)
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:justify-end">
                    {actions.map(a => (
                        <button
                            key={a}
                            type="button"
                            className={cx('btn', a === 'delete' ? 'btn-ghost text-destructive' : PRIMARY_ACTIONS.includes(a) ? 'btn-primary order-first col-span-2 sm:order-none sm:col-span-1' : 'btn-outline')}
                            onClick={() => onAction(a, s)}
                            disabled={busy}
                        >
                            {ACTION_LABEL(a, s)}
                        </button>
                    ))}
                </div>
            )}
        >
            <div className="space-y-5">
                {s.body && <p className="whitespace-pre-wrap text-sm leading-relaxed">{s.body}</p>}

                {/* what came back */}
                {showChoice && chosen && pricing && (
                    <section aria-label="The client's choice" className="overflow-hidden rounded-xl border border-primary/30 bg-primary/5">
                        <p className="border-b border-primary/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
                            {s.chosenBy ? `${s.chosenBy} chose` : 'The client chose'}{s.chosenAt ? <span className="font-normal normal-case tracking-normal text-muted-foreground"> · {shortDate(s.chosenAt)}</span> : null}
                        </p>
                        <div className="flex items-start gap-3 px-4 py-3">
                            <StoredImage path={chosen.imagePath} alt={chosen.name} className="h-20 w-20 shrink-0 rounded-lg" fallback={<span aria-hidden className="text-[10px]">No photo</span>} />
                            <div className="min-w-0 flex-1">
                                <p className="text-base font-bold leading-snug">{chosen.name}</p>
                                {chosen.description && <p className="mt-0.5 text-sm text-muted-foreground">{chosen.description}</p>}
                                <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums">
                                    <span className="font-semibold">{moneyText(pricing.total)}</span>
                                    <span className="text-xs text-muted-foreground">{chosen.qty}{chosen.unit ? ` ${chosen.unit}` : ''} × {moneyText(chosen.unitPrice)}</span>
                                    <DiffText difference={pricing.difference} />
                                </p>
                                {chosen.url && (
                                    <a href={chosen.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-[32px] items-center gap-1 text-xs font-semibold text-primary">
                                        {linkHost(chosen.url)} <ExternalLinkIcon className="h-3.5 w-3.5" />
                                    </a>
                                )}
                            </div>
                        </div>
                        {s.clientComment && <p className="border-t border-primary/20 px-4 py-2.5 text-sm italic leading-relaxed">“{s.clientComment}”</p>}
                        {(pricing.cost !== null || chosen.sku) && (
                            <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-primary/20 bg-background/60 px-4 py-2 text-xs text-muted-foreground">
                                <LockIcon className="h-3 w-3 shrink-0" />
                                {pricing.cost !== null && <span>Your cost <span className="font-semibold tabular-nums text-foreground">{moneyText(pricing.cost)}</span></span>}
                                {pricing.cost !== null && pricing.total > 0 && <span>Margin <span className="font-semibold tabular-nums text-foreground">{moneyText(pricing.total - pricing.cost)}</span></span>}
                                {chosen.sku && <span>SKU {chosen.sku}</span>}
                                <span>({COST_PRIVATE})</span>
                            </p>
                        )}
                    </section>
                )}
                {s.status === 'sent' && (
                    <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
                        Waiting for your client{due.tone === 'late' ? <span className="font-semibold text-destructive"> · {due.text}</span> : null}. They choose from their project link.
                    </p>
                )}
                {s.status === 'changes_requested' && (
                    <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">You asked for changes. Edit the options, then send it again. The client sees nothing to choose until you do.</p>
                )}
                {s.status === 'ordered' && !s.poDocumentId && (
                    <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">Marked ordered without a purchase order from here, so it is not in your Ordered total. Cancel the order to create one.</p>
                )}
                {locked && <p className="rounded-xl bg-muted/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">{locked}</p>}

                {s.options.length > 0 && (
                    <section aria-label="Options">
                        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.options.length === 1 ? 'The option' : `The ${s.options.length} options`}</h3>
                        <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
                            {s.options.map(o => <OptionLine key={o.id} option={o} allowance={s.allowance} chosen={o.id === s.chosenOptionId} />)}
                        </ul>
                    </section>
                )}

                {rows.length > 0 && (
                    <section aria-label="History">
                        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">History</h3>
                        <ol className="relative space-y-3 pl-5">
                            <span aria-hidden className="absolute bottom-1 left-[5px] top-1.5 w-px bg-border" />
                            {rows.map(r => (
                                <li key={r.key} className="relative">
                                    <span aria-hidden className={cx('absolute -left-5 top-1.5 h-[11px] w-[11px] rounded-full border-2 bg-background', r.client ? 'border-primary' : 'border-muted-foreground/50')} />
                                    <p className="text-sm font-medium leading-5">{r.label}</p>
                                    <p className="text-xs text-muted-foreground">{r.when}</p>
                                    {r.note && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">“{r.note}”</p>}
                                </li>
                            ))}
                        </ol>
                    </section>
                )}
            </div>
        </Modal>
    );
};

export default SelectionDetailModal;
