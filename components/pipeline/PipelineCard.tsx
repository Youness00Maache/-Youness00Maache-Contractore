/**
 * One card on the pipeline board: job (or quote request), client, value, days in the stage, a stale / overdue chip,
 * and the one-tap actions for its stage (the first two as buttons, the rest in the ⋯ menu).
 */
import React from 'react';
import type { PipelineAction, PipelineCard as Card } from '../../lib/pipeline.ts';
import { ActionMenu } from '../viewKit.tsx';
import { AlertChip, StageTrack, ageText, wholeMoney } from './pipelineUi.tsx';
import { formatYMD } from '../../utils/localDates.ts';

/** Button / menu text of each action (the document actions name the document type). */
export const actionLabel = (action: PipelineAction, card: Card): string => {
    const docType = (card.doc?.type || 'document').toLowerCase();
    switch (action) {
        case 'convert': return 'Create job';
        case 'open_request': return 'View request';
        case 'open_job': return 'Open job';
        case 'open_doc': return `Open ${docType}`;
        case 'follow_up': return 'Follow up';
        case 'reminders': return 'Reminders';
        case 'mark_paid': return 'Mark as paid';
        case 'finish_job': return 'Mark job completed';
        case 'set_inactive': return 'Move to Inactive';
    }
};

/** What tapping the card itself opens. */
export const openActionOf = (card: Card): PipelineAction => (card.kind === 'request' ? 'open_request' : 'open_job');

/** Job status changes stay in the ⋯ menu (never a button next to the everyday actions). */
const MENU_ONLY: ReadonlySet<PipelineAction> = new Set<PipelineAction>(['finish_job', 'set_inactive']);

const PipelineCard: React.FC<{ card: Card; onAction: (action: PipelineAction, card: Card) => void; busy?: boolean }> = ({ card, onAction, busy }) => {
    const buttons = card.actions.filter(a => !MENU_ONLY.has(a)).slice(0, 2);
    const menu = card.actions.filter(a => !buttons.includes(a));
    const open = () => onAction(openActionOf(card), card);
    const sinceText = card.since ? `In this stage since ${formatYMD(card.since)}` : undefined;
    const ring = card.alert?.tone === 'danger' ? 'border-destructive/40' : card.alert?.tone === 'warning' ? 'border-warning/40' : card.alert?.tone === 'success' ? 'border-success/40' : 'border-border';

    return (
        <article
            onClick={open}
            className={`group cursor-pointer rounded-xl border ${ring} bg-card p-3 shadow-soft transition hover:border-primary/40 hover:shadow-card xl:p-2.5 ${busy ? 'pointer-events-none opacity-60' : ''}`}
            aria-busy={busy || undefined}
        >
            <div className="flex items-start justify-between gap-2">
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); open(); }}
                    className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`${card.title}, ${card.client || 'no client'}${card.alert ? `, ${card.alert.label}` : ''}`}
                >
                    <span className="block truncate text-[13px] font-semibold leading-5 text-foreground">{card.title}</span>
                    <span className="block truncate text-xs leading-4 text-muted-foreground">
                        {[card.client, card.detail].filter(Boolean).join(' · ') || '—'}
                    </span>
                </button>
                {card.value !== null && (
                    <span className="shrink-0 text-right text-[13px] font-semibold leading-5 tabular-nums text-foreground">
                        {wholeMoney(card.value)}
                        {card.valueNote && <span className="block text-[10px] font-medium uppercase leading-3 tracking-wide text-muted-foreground">{card.valueNote}</span>}
                    </span>
                )}
            </div>

            {/* where it is (the track is left out on the full desktop board, where the column says it), how long, what's wrong, ⋯ */}
            <div className="mt-1.5 flex min-h-[28px] min-w-0 items-center gap-2">
                <StageTrack stage={card.stage} className="xl:hidden" />
                {card.age !== null && <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" title={sinceText}>{ageText(card.age)}</span>}
                {card.alert && <AlertChip alert={card.alert} />}
                {menu.length > 0 && (
                    <span className="-mr-1.5 ml-auto shrink-0 [&_button]:!h-7 [&_button]:!w-7" onClick={(e) => e.stopPropagation()}>
                        <ActionMenu
                            label={`More for ${card.title}`}
                            items={menu.map(a => ({ label: actionLabel(a, card), onSelect: () => onAction(a, card), destructive: a === 'set_inactive' }))}
                        />
                    </span>
                )}
            </div>

            <div className="mt-1.5 flex items-center gap-1 border-t border-border/70 pt-2" onClick={(e) => e.stopPropagation()}>
                {buttons.map((a, i) => (
                    <button
                        key={a}
                        type="button"
                        onClick={() => onAction(a, card)}
                        disabled={busy}
                        className={`inline-flex h-8 min-w-0 items-center justify-center rounded-lg px-2.5 text-xs font-semibold transition xl:px-2 ${i === 0 ? 'bg-primary/10 text-primary hover:bg-primary/15' : 'text-foreground hover:bg-muted'}`}
                    >
                        <span className="truncate">{actionLabel(a, card)}</span>
                    </button>
                ))}
            </div>
        </article>
    );
};

export default PipelineCard;
