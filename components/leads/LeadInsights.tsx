/**
 * The slim strip under the Leads header. Premium: win rate, what is open, where leads come from, and how many have gone
 * quiet (with a button that lists them). Free: one line saying what Premium adds, with the usual upgrade button.
 * (The per-stage counts and budget totals on the board are free.)
 * Phones: win rate and open side by side, sources and the quiet button on their own rows.
 */
import React from 'react';
import type { LeadInsights as Insights } from '../../lib/leads/leadViewLogic.ts';
import type { LeadTools } from '../../lib/leads/leadLogic.ts';
import { compactMoney } from '../viewKit.tsx';
import { StarIcon } from '../Icons.tsx';
import { LEADS_PREMIUM_REASON } from './leadUi.tsx';

const pct = (rate: number | null): string => (rate === null ? '-' : `${Math.round(rate * 100)}%`);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>
);

const LeadInsights: React.FC<{
    tools: LeadTools;
    insights: Insights;
    hasLeads: boolean;
    quietOnly: boolean;
    onToggleQuiet: () => void;
    onUpgrade: (reason: string) => void;
}> = ({ tools, insights, hasLeads, quietOnly, onToggleQuiet, onUpgrade }) => {
    const [showSources, setShowSources] = React.useState(false);
    if (!hasLeads) return null;
    if (!tools.insights) {
        return (
            <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-sm" data-testid="lead-insights-free">
                <span className="min-w-0 flex-1">Premium shows your win rate, where your leads come from and which ones have gone quiet.</span>
                <button type="button" className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onUpgrade(LEADS_PREMIUM_REASON)}>
                    <StarIcon className="h-3.5 w-3.5" /> Upgrade to Premium
                </button>
            </p>
        );
    }
    const decided = insights.won + insights.lost;
    const hasQuiet = tools.reminders && insights.stale.length > 0;
    return (
        <section aria-label="Lead insights" className="mb-3 grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card text-sm sm:flex sm:flex-wrap sm:items-stretch" data-testid="lead-insights">
            <div className="px-3 py-2">
                <Label>Win rate</Label>
                <p className="font-bold tabular-nums text-foreground">{pct(insights.winRate)} <span className="text-xs font-medium text-muted-foreground">{decided ? `${insights.won} won, ${insights.lost} lost` : 'none decided yet'}</span></p>
            </div>
            <div className="border-l border-border px-3 py-2">
                <Label>Open</Label>
                <p className="font-bold tabular-nums text-foreground">{insights.openCount} <span className="text-xs font-medium text-muted-foreground">{insights.openBudget > 0 ? `${compactMoney(insights.openBudget)} budget` : 'no budgets yet'}</span></p>
            </div>
            <div className={`col-span-2 min-w-0 border-t border-border px-3 py-2 sm:col-span-1 sm:block sm:flex-1 sm:border-l sm:border-t-0 ${showSources ? 'block' : 'hidden'}`}>
                <Label>Where they come from</Label>
                <p className="flex flex-wrap gap-x-3 text-foreground">
                    {insights.sources.length === 0 ? <span className="text-muted-foreground">-</span> : insights.sources.map(s => (
                        <span key={s.origin} className="whitespace-nowrap">
                            <span className="font-semibold">{s.label}</span> <span className="tabular-nums text-muted-foreground">{s.count}{s.winRate !== null ? `, ${pct(s.winRate)} won` : ''}</span>
                        </span>
                    ))}
                </p>
            </div>
            {/* the quiet-leads button (Premium); on phones also the switch that unfolds the sources */}
            <div className={`col-span-2 flex items-center gap-2 border-t border-border px-3 py-2 sm:col-span-1 sm:border-l sm:border-t-0 ${hasQuiet ? '' : 'sm:hidden'}`}>
                {hasQuiet && (
                    <button
                        type="button"
                        onClick={onToggleQuiet}
                        aria-pressed={quietOnly}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${quietOnly ? 'border-warning/50 bg-warning/15 text-foreground' : 'border-border text-warning hover:bg-muted/60'}`}
                    >
                        {insights.stale.length} {insights.stale.length === 1 ? 'lead has' : 'leads have'} gone quiet{quietOnly ? ' (showing)' : ''}
                    </button>
                )}
                <button type="button" className="ml-auto text-xs font-semibold text-primary hover:underline sm:hidden" aria-expanded={showSources} onClick={() => setShowSources(v => !v)}>
                    {showSources ? 'Hide sources' : 'Where from?'}
                </button>
            </div>
        </section>
    );
};

export default LeadInsights;
