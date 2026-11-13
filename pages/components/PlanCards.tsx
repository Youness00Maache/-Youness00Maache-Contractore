import React from 'react';
import { PLANS, type PlanTier } from '../../lib/plans.ts';
import { ButtonLink, CheckList } from './ui.tsx';
import { SIGNUP_PATH } from '../../content/site.ts';

export type Period = 'monthly' | 'yearly';

export const signupHref = (tier: PlanTier, period: Period): string =>
  tier === 'free' ? SIGNUP_PATH : `${SIGNUP_PATH}?plan=${tier}&period=${period}`;

export const PeriodToggle: React.FC<{ period: Period; onChange: (p: Period) => void }> = ({ period, onChange }) => (
  <div className="inline-flex items-center rounded-2xl border border-border bg-card p-1 shadow-soft" role="group" aria-label="Billing period">
    {(['monthly', 'yearly'] as Period[]).map((p) => (
      <button
        key={p}
        type="button"
        aria-pressed={period === p}
        onClick={() => onChange(p)}
        className={`min-h-[40px] rounded-xl px-4 text-sm font-semibold transition-colors ${
          period === p ? 'bg-brand-600 text-white shadow-sm' : 'text-foreground/70 hover:text-foreground'
        }`}
      >
        {p === 'monthly' ? 'Monthly' : 'Yearly'}
        {p === 'yearly' ? <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${period === p ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>2 months free</span> : null}
      </button>
    ))}
  </div>
);

export const PlanCards: React.FC<{ period: Period; headingLevel?: 'h2' | 'h3'; listVariant?: 'badge' | 'tick' }> = ({ period, headingLevel = 'h3', listVariant = 'badge' }) => {
  const H = headingLevel;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {(['free', 'premium', 'ai'] as PlanTier[]).map((tier) => {
        const plan = PLANS[tier];
        const highlighted = Boolean(plan.highlighted);
        const price = period === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
        const saving = plan.monthlyPrice * 12 - plan.yearlyPrice;
        return (
          <div
            key={tier}
            className={`relative flex flex-col rounded-3xl border bg-card p-6 sm:p-8 ${
              highlighted ? 'border-brand-500 shadow-[0_24px_60px_-28px_rgba(33,72,237,.55)] ring-1 ring-brand-500' : 'border-border shadow-soft'
            }`}
          >
            {highlighted ? (
              <span className="absolute -top-3 left-6 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white shadow">Most popular</span>
            ) : null}
            <H className="font-display text-xl font-extrabold text-foreground">{plan.name}</H>
            <p className="mt-1.5 min-h-[44px] text-[15px] text-muted-foreground">{plan.tagline}</p>
            <p className="mt-5 flex items-baseline gap-1.5">
              <span className="font-display text-5xl font-extrabold tracking-[-0.01em] text-foreground">${price}</span>
              <span className="text-[15px] font-medium text-muted-foreground">{tier === 'free' ? 'forever' : period === 'yearly' ? '/ year' : '/ month'}</span>
            </p>
            <p className="mt-1 h-5 text-sm text-muted-foreground">
              {tier === 'free'
                ? 'No credit card required'
                : period === 'yearly'
                  ? `Save $${saving} a year vs. monthly`
                  : `or $${plan.yearlyPrice}/year (2 months free)`}
            </p>
            <ButtonLink
              to={signupHref(tier, period)}
              variant={highlighted ? 'primary' : 'outline'}
              size="lg"
              className="mt-6 w-full"
              aria-label={tier === 'free' ? 'Start free on the Free plan' : `Start with ${plan.name}, billed ${period}`}
            >
              {tier === 'free' ? 'Start free' : `Get ${plan.name}`}
            </ButtonLink>
            <CheckList items={plan.features} className="mt-7" variant={listVariant} />
          </div>
        );
      })}
    </div>
  );
};

export default PlanCards;
